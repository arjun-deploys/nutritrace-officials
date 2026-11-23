import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line } from 'recharts';
import { dateShort, num } from '@/lib/format';

export function ServedTrend({ data }: { data: { date: string; expected: number; served: number }[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Children present and meals served over the last 14 days">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="served" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => dateShort(d)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tickFormatter={(v) => num(v)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(d) => dateShort(String(d))}
            formatter={(v, n) => [num(Number(v)), n === 'served' ? 'Meals served' : 'Children present']}
          />
          <Area type="monotone" dataKey="served" stroke="var(--primary)" strokeWidth={2} fill="url(#served)" />
          <Line type="monotone" dataKey="expected" stroke="var(--trace)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
