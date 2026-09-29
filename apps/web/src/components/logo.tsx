import Image from "next/image";
import { cx } from "@/components/ui";

/** DASH logo using the new brand mark (PNG). Drop-in replacement for the shared Waypoint Logo within apps/web. */
export function DashLogo({
  size = 32,
  width,
  height,
  src,
  label,
  sub,
  dark,
  className,
  labelClassName,
  subClassName,
  imageClassName,
}: {
  size?: number;
  width?: number;
  height?: number;
  src?: string;
  label?: string;
  sub?: string;
  dark?: boolean;
  className?: string;
  labelClassName?: string;
  subClassName?: string;
  imageClassName?: string;
}) {
  const logoWidth = width ?? Math.round(size * 1.4);
  const logoHeight = height ?? Math.round(logoWidth / (2400 / 1309));
  const logoSrc = src ?? (dark ? "/DASH W.png" : "/DASH.png");
  return (
    <span className={cx("inline-flex items-center gap-3", className)}>
      <Image
        src={logoSrc}
        alt="DASH logo"
        width={logoWidth}
        height={logoHeight}
        className={cx("shrink-0 object-contain", imageClassName)}
        priority
      />
      {(label || sub) && (
        <span className={cx("min-w-0 leading-tight", className?.includes("text-center") && "text-center", className?.includes("lg:text-center") && "lg:text-center")}>
          {label && <span className={cx("block font-bold tracking-tight", labelClassName)}>{label}</span>}
          {sub && <span className={cx("block text-[11px] font-medium", dark ? "text-on-ink-muted" : "text-ink-2", subClassName)}>{sub}</span>}
        </span>
      )}
    </span>
  );
}
