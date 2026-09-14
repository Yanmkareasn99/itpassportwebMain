interface BrandLogoProps {
  alt?: string;
  variant?: 'wordmark' | 'mark';
}

export default function BrandLogo({ alt = 'マナビ', variant = 'wordmark' }: BrandLogoProps) {
  const mark = variant === 'mark';
  return (
    <span className={`relative inline-block shrink-0 overflow-hidden bg-white ${mark ? 'h-9 w-9' : 'h-[66px] w-[192px]'}`}>
      <img
        src="/manabi-logo.png"
        alt={alt}
        className={`absolute max-w-none ${mark ? '-left-[13px] -top-[16px] w-[122px]' : '-left-[24px] -top-[30px] w-[237px]'}`}
      />
    </span>
  );
}
