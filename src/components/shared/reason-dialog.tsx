import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/** Every consequential decision records why. Used for approvals, holds, escalations. */
export function ReasonDialog({ trigger, title, description, confirmLabel, onConfirm, minLength = 5, destructive, pending, children }: {
  trigger: ReactNode; title: string; description?: string; confirmLabel: string; onConfirm: (reason: string) => Promise<unknown> | void; minLength?: number; destructive?: boolean; pending?: boolean; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const tooShort = reason.trim().length < minLength;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setReason(''); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <div className="space-y-1.5">
          <Label htmlFor="reason">Reason (recorded in the audit trail)</Label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          {reason && tooShort && <p className="text-xs text-muted-foreground">At least {minLength} characters.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant={destructive ? 'destructive' : 'default'} disabled={tooShort} loading={pending} onClick={async () => { await onConfirm(reason.trim()); setOpen(false); setReason(''); }}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
