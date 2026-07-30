import { productImageSrc } from "@/lib/product-image";

export function ProductImage({
  imageUrl,
  slug,
  alt,
  className = "",
}: {
  imageUrl?: string | null;
  slug?: string;
  alt: string;
  className?: string;
}) {
  const src = productImageSrc(imageUrl, slug);

  return (
    <div
      className={`product-media relative overflow-hidden bg-[var(--surface-2)] ${className}`}
    >
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
      />
    </div>
  );
}
