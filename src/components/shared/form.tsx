import { useId, type ReactElement, type ReactNode, cloneElement } from 'react';
import { Controller, type Control, type FieldError, type FieldValues, type Path } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Wires label, hint and error to the control with the right aria attributes. */
export function Field({ label, error, hint, children, className, required }: { label: string; error?: FieldError | { message?: string }; hint?: ReactNode; children: ReactElement<Record<string, unknown>>; className?: string; required?: boolean }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error?.message ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-sm">
        {label}
        {required && <span className="text-danger" aria-hidden> *</span>}
      </Label>
      {cloneElement(children, { id, 'aria-invalid': !!error?.message || undefined, 'aria-describedby': describedBy })}
      {hint && !error?.message && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error?.message && <p id={`${id}-err`} className="text-xs text-danger" role="alert">{error.message}</p>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function FormSelect<T extends FieldValues>({ control, name, label, options, placeholder, hint, required, className, disabled }: {
  control: Control<T, any, any>; name: Path<T>; label: string; options: { value: string; label: string }[]; placeholder?: string; hint?: ReactNode; required?: boolean; className?: string; disabled?: boolean;
}) {
  return (
    <Controller control={control} name={name} render={({ field, fieldState }) => (
      <Field label={label} error={fieldState.error} hint={hint} required={required} className={className}>
        <SelectControl value={field.value ?? ''} onChange={field.onChange} options={options} placeholder={placeholder} disabled={disabled} />
      </Field>
    )} />
  );
}

function SelectControl({ value, onChange, options, placeholder, disabled, ...rest }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean; id?: string }) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full" {...rest}><SelectValue placeholder={placeholder ?? 'Choose…'} /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{message}</p>;
}
