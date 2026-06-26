"use client";

import { useEffect, useState } from "react";
import { getBrand } from "@/lib/firebase/services/settings";
import type { BrandSettings } from "@/lib/types";

let cache: BrandSettings | null = null;
let loaded = false;

/** Load brand settings once and cache them for headers and PDF exports. */
export function useBrand() {
  const [brand, setBrand] = useState<BrandSettings | null>(cache);

  useEffect(() => {
    let active = true;
    if (loaded) {
      setBrand(cache);
      return;
    }
    getBrand()
      .then((b) => {
        cache = b;
        loaded = true;
        if (active) setBrand(b);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return brand;
}

export function invalidateBrandCache() {
  loaded = false;
  cache = null;
}
