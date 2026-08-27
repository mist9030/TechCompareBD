import { NextResponse } from "next/server";
import {
  discoverCategoryPage,
  parseProductPage,
} from "@/lib/ingestion/adapters/ucc.js";

export const runtime = "nodejs";

export async function GET() {
  try {
    // ------------------------------------------------------------
    // 1. Test a UCC category that currently has REAL prices
    // ------------------------------------------------------------
    const listingUrl = "https://www.ucc.com.bd/laptops";

    const listing = await discoverCategoryPage(listingUrl, 1);

    if (!listing.links.length) {
      return NextResponse.json({
        success: false,
        stage: "listing",
        error: "No products found on UCC laptop listing page.",
        listingProductsFound: 0,
        totalPages: listing.totalPages,
      });
    }

    // ------------------------------------------------------------
    // 2. Find the first product whose listing price is numeric
    // ------------------------------------------------------------
    const pricedProduct = listing.links.find(
      (item) =>
        typeof item.previewPrice === "number" &&
        Number.isFinite(item.previewPrice) &&
        item.previewPrice > 0
    );

    // ------------------------------------------------------------
    // 3. If listing parser cannot find a numeric price,
    //    return diagnostic information.
    // ------------------------------------------------------------
    if (!pricedProduct) {
      return NextResponse.json({
        success: false,
        stage: "listing-price",
        error:
          "UCC laptop listing was found, but no numeric preview price was parsed.",

        listing: {
          url: listingUrl,
          productsFound: listing.links.length,
          totalPages: listing.totalPages,
          sampleProducts: listing.links.slice(0, 10),
        },

        hint:
          "The UCC laptop page contains real numeric prices. If previewPrice is null/0 here, the listing-price selector in ucc.js needs to be fixed.",
      });
    }

    // ------------------------------------------------------------
    // 4. Parse the selected product page
    // ------------------------------------------------------------
    const productUrl = pricedProduct.url;

    const product = await parseProductPage(productUrl);

    if (!product) {
      return NextResponse.json({
        success: false,
        stage: "product",
        error: "UCC product page could not be parsed.",

        selectedProduct: pricedProduct,

        productUrl,
      });
    }

    // ------------------------------------------------------------
    // 5. Compare listing price vs product-page price
    // ------------------------------------------------------------
    return NextResponse.json({
      success: true,
      firestoreUsed: false,

      listing: {
        url: listingUrl,
        productsFound: listing.links.length,
        totalPages: listing.totalPages,
        sampleProducts: listing.links.slice(0, 5),
      },

      selectedProduct: {
        url: pricedProduct.url,
        previewName: pricedProduct.previewName,
        previewPrice: pricedProduct.previewPrice,
      },

      productTest: {
        url: productUrl,
        parsed: true,

        name: product.name,
        brand: product.brand,
        model: product.model,
        sku: product.sku,

        // Most important test
        listingPrice: pricedProduct.previewPrice,
        productPagePrice: product.price,
        previousPrice: product.previousPrice,

        availabilityText: product.availabilityText,

        images: product.images,
        shortDescription: product.shortDescription,
        specs: product.specs,
      },

      priceCheck: {
        listingPrice: pricedProduct.previewPrice,
        productPagePrice: product.price,
        matched:
          pricedProduct.previewPrice === product.price ||
          product.price === null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        firestoreUsed: false,
        error: String(err?.message || err),
        stack: err?.stack || null,
      },
      { status: 500 }
    );
  }
}