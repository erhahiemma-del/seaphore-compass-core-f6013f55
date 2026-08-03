/**
 * SessionTimeoutWarning — accessible countdown dialog shown before the
 * inactivity auto-logout fires. Focus is trapped inside the dialog and
 * the "Stay signed in" button auto-focuses so keyboard-only users can
 * dismiss it in one keystroke.
 */
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface SessionTimeoutWarningProps {
  open: boolean;
  remainingMs: number;
  onExtend: () => void;
}

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function SessionTimeoutWarning({ open, remainingMs, onExtend }: SessionTimeoutWarningProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent aria-live="assertive">
        <AlertDialogHeader>
          <AlertDialogTitle>Session about to expire</AlertDialogTitle>
          <AlertDialogDescription>
            For your security, Seaphore will sign you out in{" "}
            <span className="font-semibold tabular-nums">{formatCountdown(remainingMs)}</span> due
            to inactivity.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction asChild>
            <Button onClick={onExtend} autoFocus>
              Stay signed in
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
