import { Button } from "@/components/ui/button";

export function BackendConfigurationError() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg border-l-2 border-destructive pl-6">
          <p className="text-xs font-semibold uppercase text-destructive">Configuration unavailable</p>
          <h1 className="mt-2 text-2xl font-semibold">Seaphore could not start securely</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The browser build is missing its Lovable Cloud connection settings. No intelligence
            data was loaded, and authentication remains locked until the connection is restored.
          </p>
          <Button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6"
          >
            Retry connection
          </Button>
        </div>
      </main>
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        Evidence first. Explainable always. Officer decides.
      </footer>
    </div>
  );
}
