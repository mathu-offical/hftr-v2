'use client';

import { Handle, Position } from '@xyflow/react';
import { handleIdForLink, type LinkKind, type ModuleType } from '@hftr/contracts';
import { LINK_PORT_VISUALS, portRoleLabel } from './canvas-visuals';

function portTopPercent(index: number, total: number): string {
  if (total <= 1) return '50%';
  return `${((index + 1) / (total + 1)) * 100}%`;
}

type PortSide = {
  kinds: readonly LinkKind[];
  direction: 'in' | 'out';
  position: Position.Left | Position.Right;
};

/**
 * Kind-specific connection points with a vertical bus rail on the node edge.
 * Labels describe the nature of data on that bus for the module type.
 */
export function NodePortBuses(props: {
  moduleType: ModuleType;
  inbound: readonly LinkKind[];
  outbound: readonly LinkKind[];
}) {
  const sides: PortSide[] = [
    { kinds: props.inbound, direction: 'in', position: Position.Left },
    { kinds: props.outbound, direction: 'out', position: Position.Right },
  ];

  return (
    <>
      {sides.map((side) => {
        if (side.kinds.length === 0) return null;
        const isLeft = side.position === Position.Left;
        return (
          <div key={side.direction}>
            {/* Visual bus rail — segments per link kind on this edge. */}
            <div
              className="pointer-events-none absolute top-3 bottom-3 w-[3px] overflow-hidden rounded-full"
              style={{
                [isLeft ? 'left' : 'right']: -1,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
              aria-hidden
            >
              {side.kinds.map((kind) => (
                <div
                  key={`${side.direction}-rail-${kind}`}
                  className="min-h-[12px] flex-1"
                  style={{
                    background: LINK_PORT_VISUALS[kind].color,
                    opacity: 0.45,
                  }}
                  title={portRoleLabel(props.moduleType, kind, side.direction)}
                />
              ))}
            </div>

            {side.kinds.map((kind, index) => {
              const handleId = handleIdForLink(kind, side.direction);
              const port = LINK_PORT_VISUALS[kind];
              const role = portRoleLabel(props.moduleType, kind, side.direction);
              const top = portTopPercent(index, side.kinds.length);
              return (
                <div key={handleId}>
                  <Handle
                    id={handleId}
                    type={side.direction === 'in' ? 'target' : 'source'}
                    position={side.position}
                    className="hftr-handle"
                    aria-label={`${role} (${port.label})`}
                    title={role}
                    style={{
                      top,
                      width: 10,
                      height: 10,
                      background: port.color,
                      border: '2px solid var(--color-surface-0)',
                      borderRadius: kind === 'fund_route' ? 2 : '9999px',
                    }}
                  />
                  <span
                    className={`pointer-events-none absolute w-[4.75rem] text-[8px] leading-tight text-[var(--color-ink-faint)] ${
                      isLeft ? '-left-[5.1rem] text-right' : '-right-[5.1rem] text-left'
                    }`}
                    style={{ top, transform: 'translateY(-50%)' }}
                    aria-hidden
                  >
                    {role}
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

/** Top data bus + side fund bus for Math (shared hub or dedicated tool). */
export function MathPortBuses() {
  const dataIn = portRoleLabel('math', 'data_feed', 'in');
  const dataOut = portRoleLabel('math', 'data_feed', 'out');
  const fundIn = portRoleLabel('math', 'fund_route', 'in');
  const fundOut = portRoleLabel('math', 'fund_route', 'out');
  return (
    <>
      {/* Top dependency / data bus rail */}
      <div
        className="pointer-events-none absolute left-6 right-6 top-0 h-[3px] overflow-hidden rounded-full"
        style={{
          display: 'flex',
          gap: 4,
          transform: 'translateY(-1px)',
        }}
        aria-hidden
      >
        <div className="flex-1" style={{ background: LINK_PORT_VISUALS.data_feed.color, opacity: 0.5 }} />
        <div className="flex-1" style={{ background: LINK_PORT_VISUALS.data_feed.color, opacity: 0.5 }} />
      </div>
      <Handle
        id={handleIdForLink('data_feed', 'in')}
        type="target"
        position={Position.Top}
        className="hftr-handle"
        aria-label={dataIn}
        title={dataIn}
        style={{
          left: '32%',
          width: 10,
          height: 10,
          background: LINK_PORT_VISUALS.data_feed.color,
          border: '2px solid var(--color-surface-0)',
        }}
      />
      <span
        className="pointer-events-none absolute left-[18%] -top-4 text-[8px] text-[var(--color-ink-faint)]"
        aria-hidden
      >
        {dataIn}
      </span>
      <Handle
        id={handleIdForLink('data_feed', 'out')}
        type="source"
        position={Position.Top}
        className="hftr-handle"
        aria-label={dataOut}
        title={dataOut}
        style={{
          left: '68%',
          width: 10,
          height: 10,
          background: LINK_PORT_VISUALS.data_feed.color,
          border: '2px solid var(--color-surface-0)',
        }}
      />
      <span
        className="pointer-events-none absolute left-[58%] -top-4 text-[8px] text-[var(--color-ink-faint)]"
        aria-hidden
      >
        {dataOut}
      </span>

      {/* Side fund bus */}
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
      <Handle
        id={handleIdForLink('fund_route', 'in')}
        type="target"
        position={Position.Left}
        className="hftr-handle"
        aria-label={fundIn}
        title={fundIn}
        style={{
          top: '50%',
          width: 10,
          height: 10,
          background: LINK_PORT_VISUALS.fund_route.color,
          border: '2px solid var(--color-surface-0)',
          borderRadius: 2,
        }}
      />
      <span
        className="pointer-events-none absolute -left-[4.5rem] top-1/2 w-16 -translate-y-1/2 text-right text-[8px] text-[var(--color-ink-faint)]"
        aria-hidden
      >
        {fundIn}
      </span>
      <Handle
        id={handleIdForLink('fund_route', 'out')}
        type="source"
        position={Position.Right}
        className="hftr-handle"
        aria-label={fundOut}
        title={fundOut}
        style={{
          top: '50%',
          width: 10,
          height: 10,
          background: LINK_PORT_VISUALS.fund_route.color,
          border: '2px solid var(--color-surface-0)',
          borderRadius: 2,
        }}
      />
      <span
        className="pointer-events-none absolute -right-[4.5rem] top-1/2 w-16 -translate-y-1/2 text-left text-[8px] text-[var(--color-ink-faint)]"
        aria-hidden
      >
        {fundOut}
      </span>
    </>
  );
}
