interface LaunchBoundaryBannerProps {
  message?: string;
}

export function LaunchBoundaryBanner({ message }: LaunchBoundaryBannerProps) {
  return (
    <div className="rounded-md border border-warning-foreground/25 bg-warning p-3 text-sm text-warning-foreground">
      <p className="font-medium">Historical Data Notice</p>
      <p>{message ?? "Some data in the selected range may be incomplete due to limited history availability."}</p>
    </div>
  );
}
