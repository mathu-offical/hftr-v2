import { describe, expect, it } from 'vitest';
import type { SessionPhase } from '@hftr/contracts';
import {
  DEFAULT_FRESHNESS_WINDOW_MS,
  evaluateGates,
  gatesPass,
  type GateInput,
  type GateName,
} from '../gates';

const NOW_MS = 1_750_000_000_000;

function baseInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    symbol: 'AAPL',
    direction: 'up',
    scannedAtMs: NOW_MS - 60_000,
    nowMs: NOW_MS,
    sessionPhase: 'open',
    mode: 'paper',
    ...overrides,
  };
}

function gateResult(gates: ReturnType<typeof evaluateGates>, name: GateName) {
  const g = gates.find((x) => x.gate === name);
  if (!g) throw new Error(`missing gate ${name}`);
  return g;
}

const SESSION_PHASES: SessionPhase[] = [
  'pre_market',
  'open',
  'midday',
  'power_hour',
  'closed',
  'overnight',
];

describe('v1-parity six-gate admission', () => {
  it('always emits exactly six gates in stable order', () => {
    const gates = evaluateGates(baseInput());
    expect(gates.map((g) => g.gate)).toEqual([
      'regime_fit',
      'symbol_universe_fit',
      'session_fit',
      'broker_fit',
      'market_structure_fit',
      'evidence_fit',
    ]);
  });

  it.each(SESSION_PHASES)('paper mode passes session_fit for phase %s', (sessionPhase) => {
    const gates = evaluateGates(baseInput({ sessionPhase, mode: 'paper' }));
    expect(gateResult(gates, 'session_fit').result).toBe('pass');
  });

  it.each(['open', 'midday', 'power_hour'] as const)(
    'live mode passes session_fit when market open (%s)',
    (sessionPhase) => {
      const gates = evaluateGates(
        baseInput({
          sessionPhase,
          mode: 'live',
          brokerConnected: true,
          brokerConnectionMode: 'live',
        }),
      );
      expect(gateResult(gates, 'session_fit').result).toBe('pass');
      expect(gateResult(gates, 'session_fit').evidence).toContain('market open');
    },
  );

  it.each(['pre_market', 'closed', 'overnight'] as const)(
    'live mode fails session_fit when market closed (%s)',
    (sessionPhase) => {
      const gates = evaluateGates(
        baseInput({
          sessionPhase,
          mode: 'live',
          brokerConnected: true,
          brokerConnectionMode: 'live',
        }),
      );
      expect(gateResult(gates, 'session_fit').result).toBe('fail');
      expect(gatesPass(gates)).toBe(false);
    },
  );

  it('paper mode session waiver evidence is explicit when closed', () => {
    const gates = evaluateGates(baseInput({ sessionPhase: 'closed', mode: 'paper' }));
    expect(gateResult(gates, 'session_fit').evidence).toBe('paper_mode_session_waiver');
  });

  describe('broker_fit paper vs live', () => {
    it('paper + paper_sim without broker passes', () => {
      const gates = evaluateGates(
        baseInput({ mode: 'paper', venue: 'paper_sim', brokerConnected: false }),
      );
      expect(gateResult(gates, 'broker_fit').result).toBe('pass');
      expect(gateResult(gates, 'broker_fit').evidence).toContain('synthetic_sim');
    });

    it('paper with connected paper broker overlay passes', () => {
      const gates = evaluateGates(
        baseInput({
          mode: 'paper',
          venue: 'alpaca',
          brokerConnected: true,
          brokerConnectionMode: 'paper',
        }),
      );
      expect(gateResult(gates, 'broker_fit').result).toBe('pass');
      expect(gateResult(gates, 'broker_fit').evidence).toContain('paper');
    });

    it('live without broker connection fails', () => {
      const gates = evaluateGates(baseInput({ mode: 'live', brokerConnected: false }));
      expect(gateResult(gates, 'broker_fit').result).toBe('fail');
    });

    it('live with live broker credentials passes', () => {
      const gates = evaluateGates(
        baseInput({
          mode: 'live',
          venue: 'alpaca',
          brokerConnected: true,
          brokerConnectionMode: 'live',
        }),
      );
      expect(gateResult(gates, 'broker_fit').result).toBe('pass');
    });

    it('live mode rejects paper broker credentials', () => {
      const gates = evaluateGates(
        baseInput({
          mode: 'live',
          brokerConnected: true,
          brokerConnectionMode: 'paper',
        }),
      );
      expect(gateResult(gates, 'broker_fit').result).toBe('fail');
      expect(gateResult(gates, 'broker_fit').evidence).toContain('cannot dispatch');
    });
  });

  describe('regime_fit', () => {
    it('uses placeholder pass when regimeTrendUp absent', () => {
      const gates = evaluateGates(baseInput());
      expect(gateResult(gates, 'regime_fit').result).toBe('pass');
      expect(gateResult(gates, 'regime_fit').evidence).toContain('placeholder');
    });

    it.each([
      ['up', 0.8, 'pass'],
      ['up', 0.3, 'fail'],
      ['down', 0.2, 'pass'],
      ['down', 0.7, 'fail'],
      ['flat', 0.1, 'pass'],
    ] as const)('direction=%s trendUp=%s → %s', (direction, regimeTrendUp, expected) => {
      const gates = evaluateGates(baseInput({ direction, regimeTrendUp }));
      expect(gateResult(gates, 'regime_fit').result).toBe(expected);
    });
  });

  describe('symbol_universe_fit', () => {
    it.each(['AAPL', 'BRK.B', 'SPY'] as const)('accepts valid symbol %s', (symbol) => {
      const gates = evaluateGates(baseInput({ symbol }));
      expect(gateResult(gates, 'symbol_universe_fit').result).toBe('pass');
    });

    it.each(['aapl', 'TOOLONGSYMBOL', 'AA$PL', ''] as const)(
      'rejects invalid symbol %j',
      (symbol) => {
        const gates = evaluateGates(baseInput({ symbol }));
        expect(gateResult(gates, 'symbol_universe_fit').result).toBe('fail');
      },
    );

    it('rejects symbol outside module instrument list', () => {
      const gates = evaluateGates(baseInput({ symbol: 'MSFT', instruments: ['AAPL', 'GOOG'] }));
      expect(gateResult(gates, 'symbol_universe_fit').result).toBe('fail');
    });

    it('accepts case-insensitive universe match', () => {
      const gates = evaluateGates(baseInput({ symbol: 'AAPL', instruments: ['aapl'] }));
      expect(gateResult(gates, 'symbol_universe_fit').result).toBe('pass');
    });
  });

  describe('market_structure_fit', () => {
    it('passes broker_state feed in live mode', () => {
      const gates = evaluateGates(
        baseInput({
          mode: 'live',
          feedClass: 'broker_state',
          venue: 'alpaca',
          brokerConnected: true,
          brokerConnectionMode: 'live',
        }),
      );
      expect(gateResult(gates, 'market_structure_fit').result).toBe('pass');
    });

    it('fails delayed feed in live mode', () => {
      const gates = evaluateGates(baseInput({ mode: 'live', feedClass: 'delayed' }));
      expect(gateResult(gates, 'market_structure_fit').result).toBe('fail');
    });

    it('waives delayed feed in paper mode', () => {
      const gates = evaluateGates(baseInput({ mode: 'paper', feedClass: 'delayed' }));
      expect(gateResult(gates, 'market_structure_fit').result).toBe('pass');
      expect(gateResult(gates, 'market_structure_fit').evidence).toContain('waiver');
    });

    it('passes synthetic_sim on paper_sim venue', () => {
      const gates = evaluateGates(baseInput({ feedClass: 'synthetic_sim', venue: 'paper_sim' }));
      expect(gateResult(gates, 'market_structure_fit').result).toBe('pass');
    });
  });

  describe('evidence_fit freshness', () => {
    it('passes when scan age within default window', () => {
      const gates = evaluateGates(
        baseInput({ scannedAtMs: NOW_MS - DEFAULT_FRESHNESS_WINDOW_MS + 1 }),
      );
      expect(gateResult(gates, 'evidence_fit').result).toBe('pass');
    });

    it('fails when scan age exceeds window', () => {
      const gates = evaluateGates(
        baseInput({ scannedAtMs: NOW_MS - DEFAULT_FRESHNESS_WINDOW_MS - 1 }),
      );
      expect(gateResult(gates, 'evidence_fit').result).toBe('fail');
    });

    it('fails for future-dated scans (negative age)', () => {
      const gates = evaluateGates(baseInput({ scannedAtMs: NOW_MS + 60_000 }));
      expect(gateResult(gates, 'evidence_fit').result).toBe('fail');
    });
  });

  it('gatesPass is false when any gate fails', () => {
    const gates = evaluateGates(
      baseInput({
        mode: 'live',
        sessionPhase: 'overnight',
        brokerConnected: true,
        brokerConnectionMode: 'live',
      }),
    );
    expect(gatesPass(gates)).toBe(false);
  });
});
