interface DashboardShellProps {
  children: React.ReactNode;
  workspaceName: string;
}

export function DashboardShell({ children, workspaceName }: DashboardShellProps) {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {workspaceName}
          </h1>
          <p className="text-muted-foreground">
            Analytics Dashboard
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
