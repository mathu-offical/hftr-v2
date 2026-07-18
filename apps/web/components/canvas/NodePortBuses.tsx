'use client';

import { Handle, Position } from '@xyflow/react';
import {
  handleIdForStream,
  type LinkKind,
  type ModuleType,
  type StreamPortSpec,
} from '@hftr/contracts';
import { LINK_PORT_VISUALS, portRoleLabel } from './canvas-visuals';

function portTopPercent(index: number, total: number): string {
  if (total <= 1) return '50%';
  return `${((index + 1) / (total + 1)) * 100}%`;
}

function portLeftPercent(index: number, total: number): string {
  if (total <= 1) return '50%';
  return `${((index + 1) / (total + 1)) * 100}%`;
}

function streamLabel(
  moduleType: ModuleType,
  port: StreamPortSpec,
): string {
  const role = portRoleLabel(moduleType, port.kind, port.direction);
  if (port.role === 'bus') return role;
  const peer = port.peerLabel?.trim() || 'peer';
  return port.direction === 'in' ? `← ${peer}` : `→ ${peer}`;
}

/**
 * Per-stream + bus connection points with a vertical rail on the node edge.
 * Bus ports accept new links; stream ports bind one existing dependency peer.
 */
export function NodePortBuses(props: {
  moduleType: ModuleType;
  inbound: readonly StreamPortSpec[];
  outbound: readonly StreamPortSpec[];
}) {
  const sides: Array<{
    ports: readonly StreamPortSpec[];
    direction: 'in' | 'out';
    position: Position.Left | Position.Right;
  }> = [
    { ports: props.inbound, direction: 'in', position: Position.Left },
    { ports: props.outbound, direction: 'out', position: Position.Right },
  ];

  return (
    <>
      {sides.map((side) => {
        if (side.ports.length === 0) return null;
        const isLeft = side.position === Position.Left;
        const kinds = [...new Set(side.ports.map((p) => p.kind))];
        return (
          <div key={side.direction}>
            <div
              className="pointer-events-none absolute top-2 bottom-2 w-[3px] overflow-hidden rounded-full"
              style={{
                [isLeft ? 'left' : 'right']: -1,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
              aria-hidden
            >
              {kinds.map((kind) => (
                <div
                  key={`${side.direction}-rail-${kind}`}
                  className="min-h-[8px] flex-1"
                  style={{
                    background: LINK_PORT_VISUALS[kind].color,
                    opacity: 0.4,
                  }}
                />
              ))}
            </div>

            {side.ports.map((port, index) => {
              const visual = LINK_PORT_VISUALS[port.kind];
              const label = streamLabel(props.moduleType, port);
              const top = portTopPercent(index, side.ports.length);
              const isStream = port.role === 'stream';
              return (
                <div key={port.handleId}>
                  <Handle
                    id={port.handleId}
                    type={side.direction === 'in' ? 'target' : 'source'}
                    position={side.position}
                    className="hftr-handle"
                    aria-label={`${label} (${visual.label})`}
                    title={label}
                    style={{
                      top,
                      width: isStream ? 8 : 10,
                      height: isStream ? 8 : 10,
                      background: visual.color,
                      border: isStream
                        ? '1px solid var(--color-surface-0)'
                        : '2px solid var(--color-surface-0)',
                      borderRadius: port.kind === 'fund_route' ? 2 : '9999px',
                      opacity: isStream ? 0.95 : 1,
                    }}
                  />
                  <span
                    className={`pointer-events-none absolute w-[4.75rem] text-[7px] leading-tight ${
                      isStream ? 'text-[var(--color-ink-dim)]' : 'text-[var(--color-ink-faint)]'
                    } ${isLeft ? '-left-[5.1rem] text-right' : '-right-[5.1rem] text-left'}`}
                    style={{ top, transform: 'translateY(-50%)' }}
                    aria-hidden
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

/** Top data streams + side fund bus/streams for Math. */
export function MathPortBuses(props: {
  inbound: readonly StreamPortSpec[];
  outbound: readonly StreamPortSpec[];
}) {
  const dataIn = props.inbound.filter((p) => p.kind === 'data_feed');
  const dataOut = props.outbound.filter((p) => p.kind === 'data_feed');
  const fundIn = props.inbound.filter((p) => p.kind === 'fund_route');
  const fundOut = props.outbound.filter((p) => p.kind === 'fund_route');

  const fallbackIn: StreamPortSpec = {
    handleId: handleIdForStream('data_feed', 'in'),
    kind: 'data_feed',
    direction: 'in',
    peerModuleId: null,
    peerLabel: null,
    role: 'bus',
  };
  const fallbackOut: StreamPortSpec = {
    handleId: handleIdForStream('data_feed', 'out'),
    kind: 'data_feed',
    direction: 'out',
    peerModuleId: null,
    peerLabel: null,
    role: 'bus',
  };
  const fallbackFundIn: StreamPortSpec = {
    handleId: handleIdForStream('fund_route', 'in'),
    kind: 'fund_route',
    direction: 'in',
    peerModuleId: null,
    peerLabel: null,
    role: 'bus',
  };
  const fallbackFundOut: StreamPortSpec = {
    handleId: handleIdForStream('fund_route', 'out'),
    kind: 'fund_route',
    direction: 'out',
    peerModuleId: null,
    peerLabel: null,
    role: 'bus',
  };

  const topIn = dataIn.length > 0 ? dataIn : [fallbackIn];
  const topOut = dataOut.length > 0 ? dataOut : [fallbackOut];
  const sideIn = fundIn.length > 0 ? fundIn : [fallbackFundIn];
  const sideOut = fundOut.length > 0 ? fundOut : [fallbackFundOut];
  // Top edge L→R: calc-ins (pipeline order) then calc-outs (same peer order).
  const topTotal = topIn.length + topOut.length;

  return (
    <>
      <div
        className="pointer-events-none absolute left-4 right-4 top-0 h-[3px] overflow-hidden rounded-full"
        style={{ display: 'flex', gap: 2, transform: 'translateY(-1px)' }}
        aria-hidden
      >
        {[...topIn, ...topOut].map((port) => (
          <div
            key={`top-rail-${port.handleId}`}
            className="min-w-[8px] flex-1"
            style={{ background: LINK_PORT_VISUALS.data_feed.color, opacity: 0.45 }}
          />
        ))}
      </div>

      {topIn.map((port, index) => {
        const label = streamLabel('math', port);
        const left = portLeftPercent(index, topTotal);
        return (
          <div key={port.handleId}>
            <Handle
              id={port.handleId}
              type="target"
              position={Position.Top}
              className="hftr-handle"
              aria-label={label}
              title={label}
              style={{
                left,
                width: port.role === 'stream' ? 8 : 10,
                height: port.role === 'stream' ? 8 : 10,
                background: LINK_PORT_VISUALS.data_feed.color,
                border: '2px solid var(--color-surface-0)',
              }}
            />
            <span
              className="pointer-events-none absolute -top-3.5 max-w-[3.5rem] truncate text-[7px] text-[var(--color-ink-faint)]"
              style={{ left, transform: 'translateX(-50%)' }}
              aria-hidden
            >
              {label}
            </span>
          </div>
        );
      })}

      {topOut.map((port, index) => {
        const label = streamLabel('math', port);
        const left = portLeftPercent(topIn.length + index, topTotal);
        return (
          <div key={port.handleId}>
            <Handle
              id={port.handleId}
              type="source"
              position={Position.Top}
              className="hftr-handle"
              aria-label={label}
              title={label}
              style={{
                left,
                width: port.role === 'stream' ? 8 : 10,
                height: port.role === 'stream' ? 8 : 10,
                background: LINK_PORT_VISUALS.data_feed.color,
                border: '2px solid var(--color-surface-0)',
              }}
            />
            <span
              className="pointer-events-none absolute -top-3.5 max-w-[3.5rem] truncate text-[7px] text-[var(--color-ink-faint)]"
              style={{ left, transform: 'translateX(-50%)' }}
              aria-hidden
            >
              {label}
            </span>
          </div>
        );
      })}

      <div
        className="pointer-events-none absolute top-1/2 left-0 right-0 h-[3px] -translate-y-1/2"
        aria-hidden
      >
        <div
          className="absolute left-0 right-0 top-0 h-full opacity-30"
          style={{
            background: `linear-gradient(90deg, ${LINK_PORT_VISUALS.fund_route.color}, transparent 40%, transparent 60%, ${LINK_PORT_VISUALS.fund_route.color})`,
          }}
        />
      </div>

      {sideIn.map((port, index) => {
        const label = streamLabel('math', port);
        const top = portTopPercent(index, sideIn.length);
        return (
          <div key={port.handleId}>
            <Handle
              id={port.handleId}
              type="target"
              position={Position.Left}
              className="hftr-handle"
              aria-label={label}
              title={label}
              style={{
                top,
                width: 10,
                height: 10,
                background: LINK_PORT_VISUALS.fund_route.color,
                border: '2px solid var(--color-surface-0)',
                borderRadius: 2,
              }}
            />
            <span
              className="pointer-events-none absolute -left-[4.5rem] w-16 text-right text-[7px] text-[var(--color-ink-faint)]"
              style={{ top, transform: 'translateY(-50%)' }}
              aria-hidden
            >
              {label}
            </span>
          </div>
        );
      })}

      {sideOut.map((port, index) => {
        const label = streamLabel('math', port);
        const top = portTopPercent(index, sideOut.length);
        return (
          <div key={port.handleId}>
            <Handle
              id={port.handleId}
              type="source"
              position={Position.Right}
              className="hftr-handle"
              aria-label={label}
              title={label}
              style={{
                top,
                width: 10,
                height: 10,
                background: LINK_PORT_VISUALS.fund_route.color,
                border: '2px solid var(--color-surface-0)',
                borderRadius: 2,
              }}
            />
            <span
              className="pointer-events-none absolute -right-[4.5rem] w-16 text-left text-[7px] text-[var(--color-ink-faint)]"
              style={{ top, transform: 'translateY(-50%)' }}
              aria-hidden
            >
              {label}
            </span>
          </div>
        );
      })}
    </>
  );
}
