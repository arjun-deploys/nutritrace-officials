import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';

function Message({ code, title, body, action }: { code: string; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="max-w-md space-y-3 text-center">
        <p className="text-sm font-medium text-trace-ink num">{code}</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
        <div className="pt-2">{action ?? <Button asChild><Link to="/">Go to the command centre</Link></Button>}</div>
      </div>
    </div>
  );
}

export const NotFound = () => <Message code="404" title="This page does not exist" body="The link may be out of date, or the record was removed." />;
export const Forbidden = () => <Message code="403" title="This area is not part of your role" body="Ask your administrator if you need access. Every access decision is enforced by the server as well." />;

export function RouteError() {
  const err = useRouteError();
  if (isRouteErrorResponse(err) && err.status === 404) return <NotFound />;
  const chunk = err instanceof Error && /dynamically imported module|Loading chunk/i.test(err.message);
  return (
    <Message
      code={chunk ? 'Update' : 'Error'}
      title={chunk ? 'A new version is available' : 'Something went wrong on this screen'}
      body={chunk ? 'Reload to get the latest version of NutriTrace.' : 'The problem has been logged. Reload the page; if it keeps happening, contact support with the time it occurred.'}
      action={<Button onClick={() => window.location.reload()}>Reload</Button>}
    />
  );
}
