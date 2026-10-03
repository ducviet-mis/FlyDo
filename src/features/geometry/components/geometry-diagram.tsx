'use client';

import { memo, useId } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateGeometryDiagram } from '../geometry-validator';
import type { GeometryDiagram as GeometryDiagramData, GeometryLineStyle, GeometryPoint, GeometryTone } from '../types';

type Props = {
  data: unknown;
  className?: string;
  showValidationError?: boolean;
};

const color = (tone: GeometryTone = 'default') => `var(--geometry-${tone}, ${{
  default: 'rgb(var(--color-text-primary))',
  primary: 'rgb(var(--color-primary))',
  muted: 'rgb(var(--color-text-secondary))',
  success: 'rgb(var(--color-success))',
  warning: 'rgb(var(--color-warning))',
}[tone]})`;

const fillColor = (fill = 'none') => ({
  none: 'none',
  primary: 'var(--geometry-fill-primary, rgb(var(--color-primary)))',
  muted: 'var(--geometry-fill-muted, rgb(var(--color-muted)))',
  success: 'var(--geometry-fill-success, rgb(var(--color-success)))',
  warning: 'var(--geometry-fill-warning, rgb(var(--color-warning)))',
}[fill] ?? 'none');

const dash = (style: GeometryLineStyle = 'solid') => style === 'dashed' ? '8 6' : style === 'dotted' ? '2 5' : undefined;
const radians = (degrees: number) => degrees * Math.PI / 180;

function unit(from: GeometryPoint, to: GeometryPoint) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function labelNode(key: string, x: number, y: number, label?: string, anchor: 'start' | 'middle' | 'end' = 'middle', tone: GeometryTone = 'default') {
  if (!label) return null;
  return (
    <text
      key={key}
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="middle"
      fontSize="13"
      fontWeight="650"
      fill={color(tone)}
      stroke="var(--geometry-background, rgb(var(--color-card)))"
      strokeWidth="4"
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {label}
    </text>
  );
}

function renderAxes(diagram: GeometryDiagramData, markerId: string) {
  const axes = diagram.axes;
  if (!axes) return null;
  const ux = axes.unit_x ?? 28;
  const uy = axes.unit_y ?? 28;
  const x = (value: number) => axes.origin_x + value * ux;
  const y = (value: number) => axes.origin_y - value * uy;
  const xTicks = Array.from({ length: Math.min(51, Math.floor(axes.x_max - axes.x_min) + 1) }, (_, index) => Math.ceil(axes.x_min) + index).filter((v) => v <= axes.x_max);
  const yTicks = Array.from({ length: Math.min(51, Math.floor(axes.y_max - axes.y_min) + 1) }, (_, index) => Math.ceil(axes.y_min) + index).filter((v) => v <= axes.y_max);

  return (
    <g aria-hidden="true">
      {axes.grid && xTicks.map((value) => <line key={`gx-${value}`} x1={x(value)} y1={y(axes.y_min)} x2={x(value)} y2={y(axes.y_max)} stroke="rgb(var(--color-border))" strokeWidth="1" />)}
      {axes.grid && yTicks.map((value) => <line key={`gy-${value}`} x1={x(axes.x_min)} y1={y(value)} x2={x(axes.x_max)} y2={y(value)} stroke="rgb(var(--color-border))" strokeWidth="1" />)}
      <line x1={x(axes.x_min)} y1={axes.origin_y} x2={x(axes.x_max)} y2={axes.origin_y} stroke={color()} strokeWidth="1.7" markerEnd={`url(#${markerId})`} />
      <line x1={axes.origin_x} y1={y(axes.y_min)} x2={axes.origin_x} y2={y(axes.y_max)} stroke={color()} strokeWidth="1.7" markerEnd={`url(#${markerId})`} />
      {xTicks.filter((value) => value !== 0).map((value) => <g key={`xt-${value}`}><line x1={x(value)} y1={axes.origin_y - 4} x2={x(value)} y2={axes.origin_y + 4} stroke={color()} /><text x={x(value)} y={axes.origin_y + 16} textAnchor="middle" fontSize="10" fill={color('muted')}>{value}</text></g>)}
      {yTicks.filter((value) => value !== 0).map((value) => <g key={`yt-${value}`}><line x1={axes.origin_x - 4} y1={y(value)} x2={axes.origin_x + 4} y2={y(value)} stroke={color()} /><text x={axes.origin_x - 8} y={y(value) + 3} textAnchor="end" fontSize="10" fill={color('muted')}>{value}</text></g>)}
      <text x={axes.origin_x - 8} y={axes.origin_y + 15} textAnchor="end" fontSize="10" fill={color('muted')}>O</text>
      <text x={x(axes.x_max) - 4} y={axes.origin_y - 9} textAnchor="end" fontSize="12" fontWeight="700" fill={color()}>{axes.x_label ?? 'x'}</text>
      <text x={axes.origin_x + 9} y={y(axes.y_max) + 11} fontSize="12" fontWeight="700" fill={color()}>{axes.y_label ?? 'y'}</text>
    </g>
  );
}

function DiagramSvg({ diagram }: { diagram: GeometryDiagramData }) {
  const rawId = useId().replace(/:/g, '');
  const tones: GeometryTone[] = ['default', 'primary', 'muted', 'success', 'warning'];
  const arrowIds = Object.fromEntries(tones.map((tone) => [tone, `geometry-arrow-${tone}-${rawId}`])) as Record<GeometryTone, string>;
  const pointMap = new Map(diagram.points.map((point) => [point.id, point]));
  const get = (id: string) => pointMap.get(id)!;

  return (
    <svg
      viewBox={`0 0 ${diagram.width} ${diagram.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={diagram.alt}
      className="block h-auto w-full"
    >
      <title>{diagram.alt}</title>
      <defs>
        {tones.map((tone) => (
          <marker key={tone} id={arrowIds[tone]} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={color(tone)} />
          </marker>
        ))}
      </defs>

      {renderAxes(diagram, arrowIds.default)}

      {diagram.polygons.map((polygon, index) => (
        <polygon key={`polygon-${index}`} points={polygon.points.map((id) => `${get(id).x},${get(id).y}`).join(' ')} fill={fillColor(polygon.fill)} fillOpacity={polygon.fill === 'none' ? 0 : polygon.opacity ?? .12} stroke={color(polygon.tone)} strokeWidth="2" strokeDasharray={dash(polygon.style)} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}

      {diagram.paths.map((path, index) => (
        <path key={`path-${index}`} d={path.d} fill={fillColor(path.fill)} fillOpacity={path.fill === 'none' ? 0 : path.opacity ?? .12} stroke={color(path.tone)} strokeWidth="2" strokeDasharray={dash(path.style)} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}

      {diagram.ellipses.map((ellipse, index) => (
        <ellipse key={`ellipse-${index}`} cx={ellipse.cx} cy={ellipse.cy} rx={ellipse.rx} ry={ellipse.ry} transform={ellipse.rotation ? `rotate(${ellipse.rotation} ${ellipse.cx} ${ellipse.cy})` : undefined} fill={fillColor(ellipse.fill)} fillOpacity={ellipse.fill === 'none' ? 0 : ellipse.opacity ?? .1} stroke={color(ellipse.tone)} strokeWidth="2" strokeDasharray={dash(ellipse.style)} vectorEffect="non-scaling-stroke" />
      ))}

      {diagram.circles.map((circle, index) => {
        const center = get(circle.center);
        return <g key={`circle-${index}`}><circle cx={center.x} cy={center.y} r={circle.radius} fill="none" stroke={color(circle.tone)} strokeWidth="2" strokeDasharray={dash(circle.style)} vectorEffect="non-scaling-stroke" />{labelNode(`circle-label-${index}`, center.x + circle.radius + 8, center.y, circle.label, 'start', circle.tone)}</g>;
      })}

      {diagram.arcs.map((arc, index) => {
        const center = get(arc.center);
        const start = { x: center.x + arc.radius * Math.cos(radians(arc.start_angle)), y: center.y + arc.radius * Math.sin(radians(arc.start_angle)) };
        const end = { x: center.x + arc.radius * Math.cos(radians(arc.end_angle)), y: center.y + arc.radius * Math.sin(radians(arc.end_angle)) };
        const delta = ((arc.end_angle - arc.start_angle) % 360 + 360) % 360;
        const middle = radians(arc.start_angle + delta / 2);
        return <g key={`arc-${index}`}><path d={`M ${start.x} ${start.y} A ${arc.radius} ${arc.radius} 0 ${delta > 180 ? 1 : 0} 1 ${end.x} ${end.y}`} fill="none" stroke={color(arc.tone)} strokeWidth="2" strokeDasharray={dash(arc.style)} vectorEffect="non-scaling-stroke" />{labelNode(`arc-label-${index}`, center.x + (arc.radius + 13) * Math.cos(middle), center.y + (arc.radius + 13) * Math.sin(middle), arc.label, 'middle', arc.tone)}</g>;
      })}

      {diagram.segments.map((segment, index) => {
        const from = get(segment.from);
        const to = get(segment.to);
        const direction = unit(from, to);
        const perpendicular = { x: -direction.y, y: direction.x };
        const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const marks = Array.from({ length: segment.ticks ?? 0 }, (_, mark) => mark - ((segment.ticks ?? 0) - 1) / 2);
        const parallels = Array.from({ length: segment.parallel_marks ?? 0 }, (_, mark) => mark - ((segment.parallel_marks ?? 0) - 1) / 2);
        return (
          <g key={`segment-${index}`}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color(segment.tone)} strokeWidth="2.2" strokeDasharray={dash(segment.style)} strokeLinecap="round" markerStart={segment.arrows === 'start' || segment.arrows === 'both' ? `url(#${arrowIds[segment.tone ?? 'default']})` : undefined} markerEnd={segment.arrows === 'end' || segment.arrows === 'both' ? `url(#${arrowIds[segment.tone ?? 'default']})` : undefined} vectorEffect="non-scaling-stroke" />
            {marks.map((offset) => <line key={offset} x1={middle.x + direction.x * offset * 7 - perpendicular.x * 6} y1={middle.y + direction.y * offset * 7 - perpendicular.y * 6} x2={middle.x + direction.x * offset * 7 + perpendicular.x * 6} y2={middle.y + direction.y * offset * 7 + perpendicular.y * 6} stroke={color(segment.tone)} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
            {parallels.map((offset) => <polyline key={offset} points={`${middle.x + direction.x * offset * 10 - direction.x * 6 - perpendicular.x * 5},${middle.y + direction.y * offset * 10 - direction.y * 6 - perpendicular.y * 5} ${middle.x + direction.x * offset * 10},${middle.y + direction.y * offset * 10} ${middle.x + direction.x * offset * 10 - direction.x * 6 + perpendicular.x * 5},${middle.y + direction.y * offset * 10 - direction.y * 6 + perpendicular.y * 5}`} fill="none" stroke={color(segment.tone)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
            {labelNode(`segment-label-${index}`, middle.x + (segment.label_dx ?? perpendicular.x * 15), middle.y + (segment.label_dy ?? perpendicular.y * 15), segment.label, 'middle', segment.tone)}
          </g>
        );
      })}

      {diagram.plots.map((plot, index) => {
        if (!diagram.axes) return null;
        const axes = diagram.axes;
        const points = plot.points.map(([x, y]) => `${axes.origin_x + x * (axes.unit_x ?? 28)},${axes.origin_y - y * (axes.unit_y ?? 28)}`).join(' ');
        return <polyline key={`plot-${index}`} points={points} fill="none" stroke={color(plot.tone ?? 'primary')} strokeWidth="2.4" strokeDasharray={dash(plot.style)} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
      })}

      {diagram.angles.flatMap((angle, index) => {
        const vertex = get(angle.vertex);
        const from = get(angle.from);
        const to = get(angle.to);
        const a = unit(vertex, from);
        const b = unit(vertex, to);
        const radius = angle.radius ?? 24;
        const cross = a.x * b.y - a.y * b.x;
        const dot = a.x * b.x + a.y * b.y;
        const signed = Math.atan2(cross, dot);
        const sweep = signed >= 0 ? 1 : 0;
        const start = { x: vertex.x + a.x * radius, y: vertex.y + a.y * radius };
        const end = { x: vertex.x + b.x * radius, y: vertex.y + b.y * radius };
        const bisectorRaw = { x: a.x + b.x, y: a.y + b.y };
        const bisectorLength = Math.hypot(bisectorRaw.x, bisectorRaw.y) || 1;
        const labelPosition = { x: vertex.x + bisectorRaw.x / bisectorLength * (radius + 14), y: vertex.y + bisectorRaw.y / bisectorLength * (radius + 14) };
        const paths = [radius, ...(angle.double ? [radius + 6] : [])].map((r, arcIndex) => {
          const s = { x: vertex.x + a.x * r, y: vertex.y + a.y * r };
          const e = { x: vertex.x + b.x * r, y: vertex.y + b.y * r };
          return <path key={`angle-${index}-${arcIndex}`} d={`M ${s.x} ${s.y} A ${r} ${r} 0 0 ${sweep} ${e.x} ${e.y}`} fill="none" stroke={color(angle.tone ?? 'primary')} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />;
        });
        return [...paths, labelNode(`angle-label-${index}`, labelPosition.x, labelPosition.y, angle.label, 'middle', angle.tone ?? 'primary')];
      })}

      {diagram.right_angles.map((rightAngle, index) => {
        const at = get(rightAngle.at);
        const connected = diagram.segments.flatMap((segment) => segment.from === rightAngle.at ? [get(segment.to)] : segment.to === rightAngle.at ? [get(segment.from)] : []);
        const from = rightAngle.from ? get(rightAngle.from) : connected[0];
        const to = rightAngle.to ? get(rightAngle.to) : connected[1];
        if (!from || !to) return null;
        const a = unit(at, from);
        const b = unit(at, to);
        const size = rightAngle.size ?? 14;
        const p1 = { x: at.x + a.x * size, y: at.y + a.y * size };
        const p2 = { x: p1.x + b.x * size, y: p1.y + b.y * size };
        const p3 = { x: at.x + b.x * size, y: at.y + b.y * size };
        return <polyline key={`right-angle-${index}`} points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`} fill="none" stroke={color('primary')} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />;
      })}

      {diagram.points.map((point) => <g key={point.id}>{!point.hidden && <circle cx={point.x} cy={point.y} r="3.2" fill={color('primary')} stroke="var(--geometry-background, rgb(var(--color-card)))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}{labelNode(`point-${point.id}`, point.x + (point.label_dx ?? 8), point.y + (point.label_dy ?? -10), point.label ?? point.id, point.label_dx !== undefined && point.label_dx < 0 ? 'end' : 'start')}</g>)}
      {diagram.labels.map((label, index) => labelNode(`label-${index}`, label.x, label.y, label.text, label.align, label.tone))}
    </svg>
  );
}

export const GeometryDiagram = memo(function GeometryDiagram({ data, className, showValidationError = false }: Props) {
  if (!data) return null;
  const { diagram, errors } = validateGeometryDiagram(data);
  if (!diagram) {
    if (!showValidationError) return null;
    return (
      <div className={cn('flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning', className)} role="status">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Không thể vẽ hình: {errors[0] ?? 'dữ liệu hình chưa hợp lệ.'}</span>
      </div>
    );
  }

  return (
    <figure className={cn('mx-auto my-5 w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-soft sm:p-5', className)}>
      <div className="mx-auto w-full" style={{ maxWidth: diagram.width }}>
        <DiagramSvg diagram={diagram} />
      </div>
      <figcaption className="sr-only">{diagram.alt}</figcaption>
    </figure>
  );
});
