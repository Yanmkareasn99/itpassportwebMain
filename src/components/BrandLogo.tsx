interface BrandLogoProps {
  alt?: string;
  variant?: 'wordmark' | 'mark';
  compact?: boolean;
}

export default function BrandLogo({ alt = 'マナビ', variant = 'wordmark', compact = false }: BrandLogoProps) {
  const mark = variant === 'mark';
  return (
    <span className={`relative inline-block shrink-0 overflow-hidden ${mark ? 'h-7 w-7' : compact ? 'h-10 w-[117px]' : 'h-[50px] w-[146px]'}`}>
      <img
        src={mark ? '/manabi-icon-v3.png' : '/manabi-wordmark-v3.png'}
        alt={alt}
        className={`absolute max-w-none dark:brightness-[1.8] ${mark ? '-left-[3px] -top-[4px] w-[34px]' : compact ? '-left-[14px] -top-[17px] w-[142px]' : '-left-[17px] -top-[21px] w-[177px]'}`}
      />
    </span>
  );
}
