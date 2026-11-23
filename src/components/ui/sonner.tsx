import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useUiStore } from '@/stores/ui';

export function Toaster(props: ToasterProps) {
  const theme = useUiStore((s) => s.theme);
  return <Sonner theme={theme} position="top-right" richColors closeButton {...props} />;
}
