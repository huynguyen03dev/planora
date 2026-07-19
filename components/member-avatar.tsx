import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarColorClass } from "@/lib/avatar";
import { cn, getInitials } from "@/lib/utils";

/**
 * A member/user avatar: real image when present, otherwise initials on a
 * per-user colored disc. Pass `seed` (the user/member id) so the color is
 * stable across renames; falls back to the name when no id is available.
 */
export function MemberAvatar({
  name,
  image,
  seed,
  size = "default",
  className,
  fallbackClassName,
}: {
  name: string;
  image?: string | null;
  seed?: string;
  size?: "default" | "sm" | "lg";
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      {image ? <AvatarImage src={image} alt={name} /> : null}
      <AvatarFallback className={cn(avatarColorClass(seed ?? name), fallbackClassName)}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
