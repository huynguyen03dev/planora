interface LaunchBoundaryBannerProps {
  message?: string;
}

export function LaunchBoundaryBanner({ message }: LaunchBoundaryBannerProps) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <p className="font-medium">Historical Data Notice</p>
      <p>{message ?? "Some data in the selected range may be incomplete due to limited history availability."}</p>
    </div>
  );
}
