import { getAvatarProps } from "@/lib/avatar-utils";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

export function AvatarInitials({ name, size = "md", className }: Props) {
  const { initials, bgClass, textClass } = getAvatarProps(name);
  return (
    <div
      className={cn(
        SIZE_CLASSES[size],
        bgClass,
        textClass,
        "rounded-full flex items-center justify-center font-semibold flex-shrink-0 select-none",
        className,
      )}
      aria-label={name}
      title={name}
    >
      {initials}
    </div>
  );
}
