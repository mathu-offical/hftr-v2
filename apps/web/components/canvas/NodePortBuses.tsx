'use client';

import { Handle, Position } from '@xyflow/react';
import {
  handleIdForStream,
  isClockInPort,
  isMathDockStreamPort,
  isScheduleOutPort,
  isTimeBusOutPort,
  type ModuleType,
  type PortNature,
  type StreamPortSpec,
} from '@hftr/contracts';
import { LINK_PORT_VISUALS, NATURE_PORT_VISUALS, portRoleLabel } from './canvas-visuals';

function portTopPercent(index: number, total: number): string {
  if (total <= 1) return '50%';
  return `${((index + 1) / (total + 1)) * 100}%`;
}

function portLeftPercent(index: number, total: number): string {
  if (total <= 1) return '50%';
  return `${((index + 1) / (total + 1)) * 100}%`;
}

function portNature(port: StreamPortSpec): PortNature {
  if (port.nature) return port.nature;
  if (isClockInPort(port) || isScheduleOutPort(port) || isTimeBusOutPort(port)) return 'time';
  if (port.kind === 'fund_route') return 'fund';
  if (port.kind === 'directive' || port.kind === 'verification') return 'system';
  return 'data';
}

function streamLabel(moduleType: ModuleType, port: StreamPortSpec): string {
  if (port.label?.trim()) return port.label.trim();
  if (isClockInPort(port)) return 'Clock in';
  if (isScheduleOutPort(port)) return 'Schedule';
  if (isTimeBusOutPort(port)) return 'Time bus';
  if (port.kind === 'data_feed' && (port.peerType === 'math' || moduleType === 'math')) {
    return port.role === 'bus' ? portRoleLabel(moduleType, port.kind, port.direction) : 'Calc ref';
  }
  return portRoleLabel(moduleType, port.kind, port.direction);
}

function streamTitle(moduleType: ModuleType, port: StreamPortSpec): string {
  const label = streamLabel(moduleType, port);
  const peer = port.peerLabel?.trim();
  return peer ? `${label} · ${peer}` : label;
}

function visualForPort(port: StreamPortSpec) {
  const nature = portNature(port);
  return NATURE_PORT_VISUALS[nature] ?? LINK_PORT_VISUALS[port.kind];
}

/**
 * Per-stream + bus connection points with nature-colored rails.
 * Placement (D-105): left/right data+system; Time top schedule + right time bus;
 * bottom far-left clock_in then Math docks. Clock ports are additive.
 */
export function NodePortBuses(props: {
  moduleType: ModuleType;
  inbound: readonly StreamPortSpec[];
  outbound: readonly StreamPortSpec[];
}) {
  const all = [...props.inbound, ...props.outbound];

  const leftPorts = all.filter(
    (p) =>
      (p.edge ?? (p.direction === 'in' ? 'left' : 'right')) === 'left' &&
      !isMathDockStreamPort(p) &&
      !isClockInPort(p),
  );
  const rightPorts = all.filter(
    (p) =>
      (p.edge ?? (p.direction === 'in' ? 'left' : 'right')) === 'right' &&
      !isMathDockStreamPort(p) &&
      !isClockInPort(p) &&
      !isScheduleOutPort(p),
  );
  const topPorts = all.filter(
    (p) => p.edge === 'top' || isScheduleOutPort(p),
  );
  // Bottom L→R: clock_in (far left) then Math dock streams.
  const clockInPorts = all.filter(isClockInPort);
  const mathDockPorts = [
    ...props.outbound.filter(isMathDockStreamPort),
    ...props.inbound.filter(isMathDockStreamPort),
  ];
  const bottomPorts = [...clockInPorts, ...mathDockPorts];

  const sides: Array<{
    key: string;
    ports: readonly StreamPortSpec[];
    position: Position.Left | Position.Right | Position.Top;
  }> = [
    { key: 'left', ports: leftPorts, position: Position.Left },
    { key: 'right', ports: rightPorts, position: Position.Right },
    { key: 'top', ports: topPorts, position: Position.Top },
  ];

  return (
    <>
      {sides.map((side) => {
        if (side.ports.length === 0) return null;
        const isLeft = side.position === Position.Left;
        const isTop = side.position === Position.Top;
        const natures = [...new Set(side.ports.map(portNature))];
        return (
          <div key={side.key}>
            {!isTop ? (
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
                {natures.map((nature) => (
                  <div
                    key={`${side.key}-rail-${nature}`}
                    className="min-h-[8px] flex-1"
                    style={{
                      background: NATURE_PORT_VISUALS[nature].color,
                      opacity: 0.45,
                    }}
                  />
                ))}
              </div>
            ) : (
              <div
                className="pointer-events-none absolute top-0 left-4 right-4 h-[3px] overflow-hidden rounded-full"
                style={{ display: 'flex', gap: 2, transform: 'translateY(-1px)' }}
                aria-hidden
              >
                {side.ports.map((port) => (
                  <div
                    key={`top-rail-${port.handleId}`}
                    className="min-w-[8px] flex-1"
                    style={{ background: visualForPort(port).color, opacity: 0.5 }}
                  />
                ))}
              </div>
            )}

            {side.ports.map((port, index) => {
              const visual = visualForPort(port);
              const label = streamLabel(props.moduleType, port);
              const title = streamTitle(props.moduleType, port);
              const isStream = port.role === 'stream';
              const isOut = port.direction === 'out';
              const stylePos = isTop
                ? { left: portLeftPercent(index, side.ports.length) }
                : { top: portTopPercent(index, side.ports.length) };
              return (
                <div key={port.handleId}>
                  <Handle
                    id={port.handleId}
                    type={isOut ? 'source' : 'target'}
                    position={side.position}
                    className="hftr-handle"
                    aria-label={`${title} (${visual.label})`}
                    title={title}
                    style={{
                      ...stylePos,
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
                    className={`pointer-events-none absolute text-[6px] leading-tight ${
                      isStream ? 'text-[var(--color-ink-dim)]' : 'text-[var(--color-ink-faint)]'
                    } ${
                      isTop
                        ? '-top-3 max-w-[3.5rem] truncate text-center'
                        : isLeft
                          ? '-left-[4.6rem] w-[4.25rem] text-right'
                          : '-right-[4.6rem] w-[4.25rem] text-left'
                    }`}
                    style={
                      isTop
                        ? {
                            left: portLeftPercent(index, side.ports.length),
                            transform: 'translateX(-50%)',
                          }
                        : {
                            top: portTopPercent(index, side.ports.length),
                            transform: 'translateY(-50%)',
                          }
                    }
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

      {bottomPorts.length > 0 ? (
        <div key="bottom-ports">
          <div
            className="pointer-events-none absolute bottom-0 left-3 right-3 h-[3px] overflow-hidden rounded-full"
            style={{ display: 'flex', gap: 2, transform: 'translateY(1px)' }}
            aria-hidden
          >
            {bottomPorts.map((port) => (
              <div
                key={`bottom-rail-${port.handleId}`}
                className="min-w-[8px] flex-1"
                style={{ background: visualForPort(port).color, opacity: 0.5 }}
              />
            ))}
          </div>

          {bottomPorts.map((port, index) => {
            const label = streamLabel(props.moduleType, port);
            const title = streamTitle(props.moduleType, port);
            // Bias clock_in to far left of the bottom edge.
            const left =
              clockInPorts.length > 0 && isClockInPort(port)
                ? portLeftPercent(
                    clockInPorts.findIndex((p) => p.handleId === port.handleId),
                    Math.max(bottomPorts.length, 3),
                  )
                : portLeftPercent(index, bottomPorts.length);
            const isOut = port.direction === 'out';
            const visual = visualForPort(port);
            return (
              <div key={port.handleId}>
                <Handle
                  id={port.handleId}
                  type={isOut ? 'source' : 'target'}
                  position={Position.Bottom}
                  className="hftr-handle"
                  aria-label={title}
                  title={title}
                  style={{
                    left,
                    width: isClockInPort(port) ? 10 : 8,
                    height: isClockInPort(port) ? 10 : 8,
                    background: visual.color,
                    border: '1px solid var(--color-surface-0)',
                    borderRadius: isClockInPort(port) ? '9999px' : 2,
                  }}
                />
                <span
                  className="pointer-events-none absolute -bottom-3 max-w-[3.25rem] truncate text-[6px] text-[var(--color-ink-dim)]"
                  style={{ left, transform: 'translateX(-50%)' }}
                  aria-hidden
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
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
    peerType: null,
    role: 'bus',
    edge: 'top',
    nature: 'data',
    label: 'Calc ref',
  };
  const fallbackOut: StreamPortSpec = {
    ...fallbackIn,
    handleId: handleIdForStream('data_feed', 'out'),
    direction: 'out',
  };
  const fallbackFundIn: StreamPortSpec = {
    handleId: handleIdForStream('fund_route', 'in'),
    kind: 'fund_route',
    direction: 'in',
    peerModuleId: null,
    peerLabel: null,
    peerType: null,
    role: 'bus',
    edge: 'left',
    nature: 'fund',
    label: 'Fund in',
  };
  const fallbackFundOut: StreamPortSpec = {
    ...fallbackFundIn,
    handleId: handleIdForStream('fund_route', 'out'),
    direction: 'out',
    edge: 'right',
    label: 'Fund out',
  };

  const topIn = dataIn.length > 0 ? dataIn : [fallbackIn];
  const topOut = dataOut.length > 0 ? dataOut : [fallbackOut];
  const leftFund = fundIn.length > 0 ? fundIn : [fallbackFundIn];
  const rightFund = fundOut.length > 0 ? fundOut : [fallbackFundOut];

  const topPorts = [...topIn, ...topOut];

  return (
    <>
      <div
        className="pointer-events-none absolute top-0 left-3 right-3 h-[2px] rounded-full"
        style={{ background: NATURE_PORT_VISUALS.data.color, opacity: 0.4 }}
        aria-hidden
      />
      {topPorts.map((port, index) => {
        const left = portLeftPercent(index, topPorts.length);
        const isOut = port.direction === 'out';
        return (
          <Handle
            key={port.handleId}
            id={port.handleId}
            type={isOut ? 'source' : 'target'}
            position={Position.Top}
            className="hftr-handle"
            aria-label={streamTitle('math', port)}
            title={streamTitle('math', port)}
            style={{
              left,
              width: 8,
              height: 8,
              background: NATURE_PORT_VISUALS.data.color,
              border: '1px solid var(--color-surface-0)',
            }}
          />
        );
      })}
      {leftFund.map((port, index) => (
        <Handle
          key={port.handleId}
          id={port.handleId}
          type="target"
          position={Position.Left}
          className="hftr-handle"
          aria-label={streamTitle('math', port)}
          style={{
            top: portTopPercent(index, leftFund.length),
            width: 8,
            height: 8,
            background: NATURE_PORT_VISUALS.fund.color,
            borderRadius: 2,
            border: '1px solid var(--color-surface-0)',
          }}
        />
      ))}
      {rightFund.map((port, index) => (
        <Handle
          key={port.handleId}
          id={port.handleId}
          type="source"
          position={Position.Right}
          className="hftr-handle"
          aria-label={streamTitle('math', port)}
          style={{
            top: portTopPercent(index, rightFund.length),
            width: 8,
            height: 8,
            background: NATURE_PORT_VISUALS.fund.color,
            borderRadius: 2,
            border: '1px solid var(--color-surface-0)',
          }}
        />
      ))}
    </>
  );
}
