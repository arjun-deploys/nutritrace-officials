import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { loginSchema, type LoginInput } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FormError } from '@/components/shared/form';
import { BrandMark } from '@/app/layouts/app-sidebar';
import { identity } from '@/lib/api';
import { isApiError } from '@/lib/http';
import { useAuthStore } from '@/stores/auth';
import { JourneyArt } from './journey-art';

const STAGE = '#0f2a24';

/** `aside` is a compact slot above the form (the demo uses it for its role picker). */
export default function LoginPage({ aside }: { aside?: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string>();
  const [show, setShow] = useState(false);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });
  if (status === 'authenticated') return <Navigate to='/' replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(undefined);
    try {
      const res = await identity.login(values);
      setSession(res.accessToken, res.user);
      navigate((location.state as { from?: string })?.from ?? '/', {
        replace: true,
      });
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Could not sign in. Try again.');
    }
  });

  return (
    <div
      className='relative min-h-svh overflow-hidden text-white'
      style={{ backgroundColor: STAGE }}
    >
      {/* Ambient layers: fine dot grid + a warm glow behind the tag */}
      <div
        className='pointer-events-none absolute inset-0 opacity-[0.07]'
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
        aria-hidden
      />
      <div
        className='pointer-events-none absolute -right-40 top-1/2 size-[42rem] -translate-y-1/2 rounded-full opacity-25 blur-3xl'
        style={{
          background:
            'radial-gradient(closest-side, #f2b134 0%, transparent 70%)',
        }}
        aria-hidden
      />

      <div className='relative mx-auto grid min-h-svh max-w-[88rem] gap-x-16 gap-y-10 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_27rem] lg:grid-rows-[auto_1fr_auto] lg:px-14 lg:py-10'>
        {/* Brand */}
        <header className='flex items-center gap-3 lg:col-start-1 lg:row-start-1'>
          <BrandMark className='size-9' />
          <span className='leading-tight'>
            <span className='block text-lg font-semibold'>NutriTrace</span>
            <span className='block text-xs text-white/60'>
              Powered by StaTwig
            </span>
          </span>
        </header>

        {/* Story + journey art */}
        <section className='flex flex-col justify-center gap-8 lg:col-start-1 lg:row-start-2 lg:gap-10'>
          <div className='max-w-xl'>
            <h2 className='text-balance text-3xl leading-[1.1] font-semibold tracking-tight sm:text-4xl lg:text-[3.1rem]'>
              From the source of food to the hands of every school child.
            </h2>
            <p className='mt-4 max-w-md text-pretty text-white/70'>
              Each hand-off is recorded by the person holding the food, and
              chained to the one before it.
            </p>
          </div>
          <JourneyArt className='h-auto w-full max-w-[46rem] self-start' />
        </section>

        {/* Custody tag: the sign-in form */}
        <main className='relative mt-2 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:mt-0 lg:self-center'>
          {/* lanyard */}
          <span
            className='absolute -top-10 left-1/2 hidden h-10 w-px bg-white/30 lg:block'
            aria-hidden
          />
          <div className='relative rounded-[1.75rem] bg-card p-8 text-card-foreground shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)]'>
            {/* punched hole */}
            <span
              className='absolute -top-3 left-1/2 size-6 -translate-x-1/2 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]'
              style={{ backgroundColor: STAGE }}
              aria-hidden
            />

            <div className='mt-3 flex items-center gap-3'>
              <div className='flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary'>
                <Lock className='size-[18px]' aria-hidden />
              </div>
              <div>
                <h1 className='text-xl leading-tight font-semibold tracking-tight'>
                  Sign in
                </h1>
                <p className='text-sm text-muted-foreground'>
                  Use the account issued by your programme administrator.
                </p>
              </div>
            </div>

            {/* perforation */}
            <div
              className='relative my-6 border-t border-dashed border-border'
              aria-hidden
            >
              <span
                className='absolute -top-3 -left-11 size-6 rounded-full'
                style={{ backgroundColor: STAGE }}
              />
              <span
                className='absolute -top-3 -right-11 size-6 rounded-full'
                style={{ backgroundColor: STAGE }}
              />
            </div>

            {aside && <div className='mb-5'>{aside}</div>}

            <form onSubmit={onSubmit} className='space-y-4' noValidate>
              <FormError message={error} />
              <Field label='Username' error={form.formState.errors.username}>
                <Input
                  autoComplete='username'
                  autoFocus
                  className='h-11 rounded-xl'
                  {...form.register('username')}
                />
              </Field>
              <Field label='Password' error={form.formState.errors.password}>
                <div className='relative'>
                  <Input
                    type={show ? 'text' : 'password'}
                    autoComplete='current-password'
                    className='h-11 rounded-xl pr-10'
                    {...form.register('password')}
                  />
                  <button
                    type='button'
                    onClick={() => setShow((s) => !s)}
                    className='absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? (
                      <EyeOff className='size-4' />
                    ) : (
                      <Eye className='size-4' />
                    )}
                  </button>
                </div>
              </Field>
              <Button
                type='submit'
                className='h-12 w-full rounded-xl bg-[#f2b134] text-base font-semibold text-[#1d1503] hover:bg-[#e5a21f]'
                loading={form.formState.isSubmitting}
              >
                Sign in
              </Button>
            </form>
          </div>
        </main>

        {/* Footer note */}
        <footer className='flex items-center gap-2 text-xs text-white/55 lg:col-start-1 lg:row-start-3'>
          <ShieldCheck className='size-4' aria-hidden />
          For authorised programme staff. Access is logged.
        </footer>
      </div>
    </div>
  );
}
