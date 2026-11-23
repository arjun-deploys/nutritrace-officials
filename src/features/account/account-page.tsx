import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { passwordChangeSchema, ROLE_LABELS, type z } from '@nt/domain';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Page, PageHeader, Section, DetailList } from '@/components/shared/page';
import { Field, FormError } from '@/components/shared/form';
import { identity } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';

type Pw = z.infer<typeof passwordChangeSchema>;

export default function AccountPage() {
  const user = useAuthStore((s) => s.user!);
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.accessToken!);
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const form = useForm<Pw>({ resolver: zodResolver(passwordChangeSchema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });
  const m = useMutation({
    mutationFn: identity.changePassword, meta: { silent: true },
    onSuccess: () => {
      toast.success('Password changed. Your other sessions were signed out.');
      const forced = user.mustChangePassword;
      setSession(token, { ...user, mustChangePassword: false });
      form.reset();
      if (forced) navigate('/', { replace: true });
    },
    onError: (e) => setError((e as Error).message),
  });
  const e = form.formState.errors;
  return (
    <Page className="max-w-3xl">
      <PageHeader title="My account" description="Your role and area are set by your administrator." />
      {user.mustChangePassword && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
          <KeyRound className="mt-0.5 size-5 shrink-0" />
          <p>Choose your own password before continuing. The one you were given was temporary.</p>
        </div>
      )}
      <Section title="Profile">
        <DetailList items={[
          { label: 'Name', value: user.name }, { label: 'Username', value: user.username },
          { label: 'Role', value: ROLE_LABELS[user.role] }, { label: 'Area', value: user.scopeLabel },
          { label: 'Facility', value: user.facilityName, hidden: !user.facilityName },
        ]} />
      </Section>
      <Section title="Change password" description="At least 12 characters with an uppercase letter, a lowercase letter and a number.">
        <form className="grid max-w-md gap-3" onSubmit={form.handleSubmit((v) => { setError(undefined); m.mutate(v); })} noValidate>
          <FormError message={error} />
          <Field label="Current password" error={e.currentPassword}><Input type="password" autoComplete="current-password" {...form.register('currentPassword')} /></Field>
          <Field label="New password" error={e.newPassword}><Input type="password" autoComplete="new-password" {...form.register('newPassword')} /></Field>
          <Field label="Repeat new password" error={e.confirmPassword}><Input type="password" autoComplete="new-password" {...form.register('confirmPassword')} /></Field>
          <div><Button type="submit" loading={m.isPending}>Change password</Button></div>
        </form>
      </Section>
    </Page>
  );
}
