interface BrandLogoProps {
  alt?: string;
  variant?: 'wordmark' | 'mark';
}

export default function BrandLogo({ alt = 'マナビ', variant = 'wordmark' }: BrandLogoProps) {
  const mark = variant === 'mark';
  return (
    <span className={`relative inline-block shrink-0 overflow-hidden ${mark ? 'h-7 w-7' : 'h-[50px] w-[146px]'}`}>
      <img
        src="/manabi-logo-v2.png"
        alt={alt}
        className={`absolute max-w-none dark:brightness-[1.8] ${mark ? '-left-[9px] -top-[10px] w-[94px]' : '-left-[17px] -top-[21px] w-[177px]'}`}
      />
    </span>
  );
}
