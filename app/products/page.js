"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

import { useCatalog } from "@/lib/CatalogContext";
import { useAuth } from "@/lib/AuthContext";
import { useWishlist } from "@/lib/WishlistContext";
import { CAT_LABEL, productPriceText } from "@/lib/catalog";
const CATEGORY_ORDER = [
  "cpu",
  "mobo",
  "ram",
  "gpu",
  "ssd",
  "psu",
  "case",
  "monitor",
  "peripheral",
  "laptop",
];

/* ============================================================
   Helpers
   ============================================================ */

function getOfferShopName(offer) {
  if (!offer) return "Unknown shop";

  return (
    offer.shopName ||
    offer.shop ||
    offer.retailerName ||
    offer.retailer ||
    offer.storeName ||
    offer.store ||
    "Unknown shop"
  );
}

function getOfferAvailability(offer) {
  if (!offer) return "";

  return String(
    offer.availability ||
      offer.stockStatus ||
      offer.status ||
      ""
  ).toLowerCase();
}

function isOfferInStock(offer) {
  const availability = getOfferAvailability(offer);

  return (
    availability === "in_stock" ||
    availability === "in stock" ||
    availability === "available" ||
    availability === "stock" ||
    availability === "yes"
  );
}

function getProductMinPrice(product) {
  const offers = Array.isArray(product?.offers) ? product.offers : [];
  if (!offers.length) return null;

  let min = Infinity;
  for (const offer of offers) {
    // Only real positive prices count- null/0 means "no price announced".
const price = offer?.price == null ? NaN : Number(offer.price);
if (Number.isFinite(price) && price > 0 && price < min) {
      min = price;
    }
  }

  return min === Infinity ? null : min;
}

function formatPrice(price) {
  if (
    price == null ||
    !Number.isFinite(Number(price))
  ) {
    return "—";
  }

  return `৳ ${Number(price).toLocaleString("en-US")}`;
}

/* ============================================================
   Products Page
   ============================================================ */

function ProductsInner() {
  const params = useSearchParams();
  const router = useRouter();

  /* ----------------------------------------------------------
     State
     ---------------------------------------------------------- */

  const { products, loading } = useCatalog();
const { user } = useAuth();
const { isWishlisted, toggle: toggleWishlist } = useWishlist();
  const [search, setSearch] = useState(
    params.get("q") || ""
  );

  // The header search bar navigates to /products?q=... while this page is
  // already mounted, so state read from the URL once is not enough:
  // follow the URL whenever ?q= changes.
  const urlQuery = params.get("q") || "";
  useEffect(() => {
    setSearch(urlQuery);
  }, [urlQuery]);

  const [selectedCategories, setSelectedCategories] =
    useState(() => {
      const value = params.get("categories");

      return value
        ? value.split(",").filter(Boolean)
        : [];
    });

  const [selectedShops, setSelectedShops] =
    useState(() => {
      const value = params.get("shops");

      return value
        ? value.split(",").filter(Boolean)
        : [];
    });

  const [minPrice, setMinPrice] = useState(
    params.get("minPrice") || ""
  );

  const [maxPrice, setMaxPrice] = useState(
    params.get("maxPrice") || ""
  );

  const [inStockOnly, setInStockOnly] = useState(
    params.get("stock") === "in"
  );

  const [saleOnly, setSaleOnly] = useState(
    params.get("sale") === "1"
  );

  const [sort, setSort] = useState(
    params.get("sort") || "relevance"
  );

  const [view, setView] = useState(
    params.get("view") || "grid"
  );

  const [compareIds, setCompareIds] = useState([]);

  const [sidebarSearch, setSidebarSearch] =
useState("");
// Render only a page of cards at a time (thousands of cards = frozen tab).
const PAGE_SIZE = 24;
const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  /* ==========================================================
     Products now come from useCatalog() above — no per-page
     Firestore fetch, no loading flicker on Back navigation.
     ========================================================== */

  /* ==========================================================
     Shops
     ========================================================== */

  const shops = useMemo(() => {
    const map = new Map();

    for (const product of products) {
      for (const offer of product.offers || []) {
        const name = getOfferShopName(offer);

        if (
          !name ||
          name === "Unknown shop"
        ) {
          continue;
        }

        if (!map.has(name)) {
          map.set(name, {
            name,
            count: 0,
          });
        }

        map.get(name).count += 1;
      }
    }

    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [products]);

  /* ==========================================================
     Categories
     ========================================================== */

  const categories = useMemo(() => {
    const available = new Set(
      products
        .map((product) => product.cat)
        .filter(Boolean)
    );

    return CATEGORY_ORDER
      .filter((cat) =>
        available.has(cat)
      )
      .map((cat) => ({
        id: cat,
        label: CAT_LABEL[cat] || cat,
        count: products.filter(
          (product) =>
            product.cat === cat
        ).length,
      }));
  }, [products]);

  /* ==========================================================
     Sidebar Category Search
     ========================================================== */

  const visibleCategories = useMemo(() => {
    const value = sidebarSearch
      .trim()
      .toLowerCase();

    if (!value) {
      return categories;
    }

    return categories.filter(
      (category) =>
        category.label
          .toLowerCase()
          .includes(value)
    );
  }, [
    categories,
    sidebarSearch,
  ]);

  /* ==========================================================
     Filtering
     ========================================================== */

  const filtered = useMemo(() => {
    let list = [...products];

    /* Search */

    const searchValue = search
      .trim()
      .toLowerCase();

    if (searchValue) {
      list = list.filter((product) => {
        const name = String(
          product.name || ""
        ).toLowerCase();

        const brand = String(
          product.brand || ""
        ).toLowerCase();

        const category = String(
          CAT_LABEL[product.cat] ||
            product.cat ||
            ""
        ).toLowerCase();

        // Every word must appear somewhere in name/brand/model/category
        // ("ryzen 5600" finds "Ryzen 5 5600X"; word order doesn't matter).
        const haystack = `${name} ${brand} ${category} ${String(product.model || "").toLowerCase()}`;
        return searchValue.split(/\s+/).every((word) => haystack.includes(word));
      });
    }

    /* Categories */

    if (
      selectedCategories.length > 0
    ) {
      list = list.filter((product) =>
        selectedCategories.includes(
          product.cat
        )
      );
    }

    /* Shops */

    if (selectedShops.length > 0) {
      list = list.filter((product) =>
        (product.offers || []).some(
          (offer) =>
            selectedShops.includes(
              getOfferShopName(offer)
            )
        )
      );
    }

    /* Price */

    const min = Number(minPrice);
    const max = Number(maxPrice);

    if (
      minPrice !== "" &&
      Number.isFinite(min)
    ) {
      list = list.filter((product) => {
        const price =
          getProductMinPrice(product);

        return (
          price !== null &&
          price >= min
        );
      });
    }

    if (
      maxPrice !== "" &&
      Number.isFinite(max)
    ) {
      list = list.filter((product) => {
        const price =
          getProductMinPrice(product);

        return (
          price !== null &&
          price <= max
        );
      });
    }

    /* Stock */

    if (inStockOnly) {
      list = list.filter((product) =>
        (product.offers || []).some(
          isOfferInStock
        )
      );
    }

    /* Sale */

    if (saleOnly) {
      list = list.filter(
        (product) =>
          Number(
            product.discount || 0
          ) > 0
      );
    }

    /* Sorting */

    if (sort === "price-asc") {
      list.sort(
        (a, b) =>
          (getProductMinPrice(a) ??
            Infinity) -
          (getProductMinPrice(b) ??
            Infinity)
      );
    }

    if (sort === "price-desc") {
      list.sort(
        (a, b) =>
          (getProductMinPrice(b) ??
            -Infinity) -
          (getProductMinPrice(a) ??
            -Infinity)
      );
    }

    if (sort === "name-asc") {
      list.sort((a, b) =>
        String(
          a.name || ""
        ).localeCompare(
          String(b.name || "")
        )
      );
    }

    if (sort === "name-desc") {
      list.sort((a, b) =>
        String(
          b.name || ""
        ).localeCompare(
          String(a.name || "")
        )
      );
    }

    return list;
  }, [
    products,
    search,
    selectedCategories,
    selectedShops,
    minPrice,
    maxPrice,
    inStockOnly,
    saleOnly,
    sort,
  ]);

  /* ==========================================================
     URL
     ========================================================== */

  // Start again from page 1 whenever the filters/search/sort change.
useEffect(() => {
setVisibleCount(PAGE_SIZE);
}, [filtered]);
const visible = useMemo(
() => filtered.slice(0, visibleCount),
[filtered, visibleCount]
);
function updateUrl(overrides = {}) {    const state = {
      q: search,
      categories:
        selectedCategories.join(","),
      shops:
        selectedShops.join(","),
      minPrice,
      maxPrice,
      stock: inStockOnly
        ? "in"
        : "",
      sale: saleOnly
        ? "1"
        : "",
      sort,
      view,
      ...overrides,
    };

    const next =
      new URLSearchParams();

    Object.entries(state).forEach(
      ([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          String(value).length > 0
        ) {
          next.set(
            key,
            String(value)
          );
        }
      }
    );

    const queryString =
      next.toString();

    router.push(
      queryString
        ? `/products?${queryString}`
        : "/products"
    );
  }

  /* ==========================================================
     Category Toggle
     ========================================================== */

  function toggleCategory(
    category
  ) {
    const next =
      selectedCategories.includes(
        category
      )
        ? selectedCategories.filter(
            (item) =>
              item !== category
          )
        : [
            ...selectedCategories,
            category,
          ];

    setSelectedCategories(next);

    updateUrl({
      categories:
        next.join(","),
    });
  }

  /* ==========================================================
     Shop Toggle
     ========================================================== */

  function toggleShop(shop) {
    const next =
      selectedShops.includes(shop)
        ? selectedShops.filter(
            (item) =>
              item !== shop
          )
        : [
            ...selectedShops,
            shop,
          ];

    setSelectedShops(next);

    updateUrl({
      shops:
        next.join(","),
    });
  }

  /* ==========================================================
     Clear Filters
     ========================================================== */

  function clearFilters() {
    setSearch("");
    setSelectedCategories([]);
    setSelectedShops([]);
    setMinPrice("");
    setMaxPrice("");
    setInStockOnly(false);
    setSaleOnly(false);
    setSidebarSearch("");
    setSort("relevance");

    router.push("/products");
  }

  /* ==========================================================
     Compare
     ========================================================== */

  function toggleCompare(id) {
    setCompareIds((current) => {
      if (
        current.includes(id)
      ) {
        return current.filter(
          (item) => item !== id
        );
      }

      if (
        current.length >= 4
      ) {
        return current;
      }

      return [
        ...current,
        id,
      ];
    });
  }

  function openCompare() {
    if (!compareIds.length) {
      return;
    }

    router.push(
      `/compare?ids=${compareIds.join(",")}`
    );
  }

  /* ==========================================================
     Search
     ========================================================== */

  function submitSearch() {
    updateUrl({
      q: search,
    });
  }

  /* ==========================================================
     Render
     ========================================================== */

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-7 py-8">

      {/* ======================================================
          Header
         ====================================================== */}

      <div className="mb-7">

        <div className="text-[13px] text-ink-soft mb-2">

          <Link
            href="/"
            className="hover:underline"
          >
            Home
          </Link>

          <span className="mx-2">
            /
          </span>

          <span>
            Categories
          </span>

        </div>

        <h1 className="text-3xl font-semibold mb-2">
          All Products
        </h1>

        <p className="text-ink-soft text-[15px]">
          Every product TechCompare
          currently tracks across
          Bangladeshi retailers.
        </p>

      </div>

      {/* ======================================================
          MAIN LAYOUT
         ====================================================== */}

      <div className="
        grid
        grid-cols-1
        lg:grid-cols-[270px_minmax(0,1fr)]
        gap-7
      ">

        {/* ====================================================
            SIDEBAR
           ==================================================== */}

        <aside
  className="
    lg:sticky
    lg:top-24
    lg:self-start
    min-w-0
    h-[calc(100vh-7rem)]
  "
>

          {/* ==================================================
              Sidebar Card
             ================================================== */}

       <div
  className="
    card
    px-4
    pb-4
    h-[min(610px,calc(100vh_-_9rem))]
    overflow-y-auto
    overflow-x-hidden
    overscroll-contain
  "
>

            {/* =================================================
                Sidebar Search
               ================================================= */}

            <div className="
              sticky
              top-0
              z-10
              bg-white
              pt-4
              pb-2
              border-b
              border-line
            ">

              <input
                value={sidebarSearch}
                onChange={(e) =>
                  setSidebarSearch(
                    e.target.value
                  )
                }
                placeholder="Search in results"
                className="
                  w-full
                  border
                  border-line
                  rounded-lg
                  px-3
                  py-2.5
                  text-sm
                  outline-none
                  focus:border-pcb
                "
              />

            </div>


            {/* =================================================
                CATEGORY

                Scrollbar #1
               ================================================= */}

            <div className="
              mt-3
              shrink-0
            ">

              <h3 className="
                text-sm
                font-bold
                text-ink-soft
                uppercase
                tracking-wide
                mb-2
              ">
                Category
              </h3>

              {/* All Categories - fixed */}

              <label className="
  flex
  items-center
  gap-3
  py-1
  cursor-pointer
">

                <input
                  type="checkbox"
                  checked={
                    selectedCategories.length ===
                    0
                  }
                  onChange={() => {
                    setSelectedCategories(
                      []
                    );

                    updateUrl({
                      categories:
                        "",
                    });
                  }}
                  className="accent-pcb"
                />

                <span className="text-sm">
                  All categories
                </span>

              </label>


              {/* Category Scroll Area */}

              <div className="pr-2">

                {visibleCategories.map(
                  (category) => (

                    <label
                      key={category.id}
                      className="
                        flex
                        items-center
                        justify-between
                        gap-2
                        py-1
                        cursor-pointer
                      "
                    >

                      <span className="
                        flex
                        items-center
                        gap-3
                        min-w-0
                      ">

                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(
                            category.id
                          )}
                          onChange={() =>
                            toggleCategory(
                              category.id
                            )
                          }
                          className="accent-pcb"
                        />

                        <span className="text-sm">
                          {category.label}
                        </span>

                      </span>

                      <span className="
                        text-xs
                        text-ink-soft
                        shrink-0
                      ">
                        {category.count}
                      </span>

                    </label>

                  )
                )}

              </div>

            </div>


            {/* =================================================
                DIVIDER

                Price area remains fixed.
               ================================================= */}

            <div className="
              mt-2
              border-t
              border-line
              pt-1
              shrink-0
            " />


            {/* =================================================
    PRICE RANGE

    FIXED / NOT INSIDE LOWER SCROLL

    Min = 50%
    divider
    Max = 50%
   ================================================= */}

<div className="
  shrink-0
  mt-3
  pb-2
  border-b
  border-line
">
  <h3
    className="
      text-sm
      font-bold
      text-ink-soft
      uppercase
      tracking-wide
      mb-2
    "
  >
    Price Range (৳)
  </h3>

  <div
    className="
      grid
      grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]
      items-center
      gap-2
      w-full
    "
  >
    {/* MIN */}

    <input
      type="number"
      min="0"
      value={minPrice}
      onChange={(e) =>
        setMinPrice(e.target.value)
      }
      onBlur={() =>
        updateUrl({
          minPrice,
        })
      }
      placeholder="Min"
      className="
        w-full
        min-w-0
        border
        border-line
        rounded-lg
        px-3
        py-2
        text-sm
        outline-none
        focus:border-pcb
      "
    />

    {/* CENTER DIVIDER */}

    <div
      className="
        h-7
        w-px
        bg-line
        shrink-0
      "
    />

    {/* MAX */}

    <input
      type="number"
      min="0"
      value={maxPrice}
      onChange={(e) =>
        setMaxPrice(e.target.value)
      }
      onBlur={() =>
        updateUrl({
          maxPrice,
        })
      }
      placeholder="Max"
      className="
        w-full
        min-w-0
        border
        border-line
        rounded-lg
        px-3
        py-2
        text-sm
        outline-none
        focus:border-pcb
      "
    />
  </div>
</div>

            {/* =================================================
                LOWER FILTERS

                Scrollbar #2

                Price-এর নিচ থেকে শুরু হবে।
                Shop/Discount একই scrollbar-এর মধ্যে।
               ================================================= */}

           <div className="pr-2 mt-2">

              {/* =================================================
                  AVAILABILITY
                 ================================================= */}

              <div className="pt-4">

                <h3 className="
                  text-sm
                  font-bold
                  text-ink-soft
                  uppercase
                  tracking-wide
                  mb-3
                ">
                  Availability
                </h3>

                <label className="
                  flex
                  items-center
                  gap-3
                  cursor-pointer
                ">

                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => {
                      const value =
                        e.target.checked;

                      setInStockOnly(value);

                      updateUrl({
                        stock: value
                          ? "in"
                          : "",
                      });
                    }}
                    className="accent-pcb"
                  />

                  <span className="text-sm">
                    In Stock only
                  </span>

                </label>

              </div>


              {/* =================================================
                  SHOP
                 ================================================= */}

              <div className="mt-4">

                <h3 className="
                  text-sm
                  font-bold
                  text-ink-soft
                  uppercase
                  tracking-wide
                  mb-3
                ">
                  Shop
                </h3>

                {/* NO separate overflow here */}

                <div>

                  {shops.map((shop) => (

                    <label
                      key={shop.name}
                      className="
                        flex
                        items-center
                        justify-between
                        gap-2
                        py-1
                        cursor-pointer
                      "
                    >

                      <span className="
                        flex
                        items-center
                        gap-3
                        min-w-0
                      ">

                        <input
                          type="checkbox"
                          checked={selectedShops.includes(
                            shop.name
                          )}
                          onChange={() =>
                            toggleShop(
                              shop.name
                            )
                          }
                          className="accent-pcb"
                        />

                        <span className="
                          text-sm
                          truncate
                        ">
                          {shop.name}
                        </span>

                      </span>

                      <span className="
                        text-xs
                        text-ink-soft
                        shrink-0
                      ">
                        {shop.count}
                      </span>

                    </label>

                  ))}

                  {!shops.length && (
                    <p className="
                      text-xs
                      text-ink-soft
                    ">
                      No shop data available.
                    </p>
                  )}

                </div>

              </div>


              {/* =================================================
                  DISCOUNT
                 ================================================= */}

              <div className="mt-4">

                <h3 className="
                  text-sm
                  font-bold
                  text-ink-soft
                  uppercase
                  tracking-wide
                  mb-3
                ">
                  Discount
                </h3>

                <label className="
                  flex
                  items-center
                  gap-3
                  cursor-pointer
                ">

                  <input
                    type="checkbox"
                    checked={saleOnly}
                    onChange={(e) => {
                      const value =
                        e.target.checked;

                      setSaleOnly(value);

                      updateUrl({
                        sale: value
                          ? "1"
                          : "",
                      });
                    }}
                    className="accent-pcb"
                  />

                  <span className="text-sm">
                    On sale only
                  </span>

                </label>

              </div>


              {/* =================================================
                  CLEAR FILTERS
                 ================================================= */}

              <button
                type="button"
                onClick={clearFilters}
                className="
                  w-full
                  border
                  border-line
                  rounded-lg
                  py-2.5
                  mt-4
                  mb-3
                  text-sm
                  font-semibold
                  hover:bg-surface
                "
              >
                Clear filters
              </button>

            </div>

          </div>

        </aside>


        {/* ====================================================
            PRODUCTS AREA
           ==================================================== */}

        <main className="min-w-0">

          {/* ==================================================
              TOOLBAR
             ================================================== */}

          <div className="
            flex
            flex-col
            md:flex-row
            md:items-center
            gap-3
            mb-5
          ">

            <div className="text-[17px]">

              <strong>
                {filtered.length.toLocaleString(
                  "en-US"
                )}
              </strong>{" "}
              products found

            </div>


            <div className="
              flex
              flex-wrap
              gap-2
              md:ml-auto
            ">

              {/* Compare */}

              {compareIds.length > 0 && (

                <button
                  type="button"
                  onClick={openCompare}
                  className="
                    border
                    border-line
                    rounded-lg
                    px-4
                    py-2
                    text-sm
                    font-semibold
                    bg-white
                  "
                >
                  Compare selected (
                  {compareIds.length})
                </button>

              )}


              {/* Sort */}

              <select
                value={sort}
                onChange={(e) => {
                  const value =
                    e.target.value;

                  setSort(value);

                  updateUrl({
                    sort: value,
                  });
                }}
                className="
                  border
                  border-line
                  rounded-lg
                  px-4
                  py-2
                  text-sm
                  bg-white
                "
              >

                <option value="relevance">
                  Sort: Relevance
                </option>

                <option value="price-asc">
                  Price low to high
                </option>

                <option value="price-desc">
                  Price high to low
                </option>

                <option value="name-asc">
                  Name A–Z
                </option>

                <option value="name-desc">
                  Name Z–A
                </option>

              </select>


              {/* View */}

              <div className="
                flex
                border
                border-line
                rounded-lg
                overflow-hidden
                bg-white
              ">

                <button
                  type="button"
                  onClick={() => {
                    setView("grid");

                    updateUrl({
                      view: "grid",
                    });
                  }}
                  className={`px-3 py-2 text-sm ${
                    view === "grid"
                      ? "bg-pcb/10 text-pcb"
                      : "text-ink-soft"
                  }`}
                  aria-label="Grid view"
                >
                  ▦
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setView("list");

                    updateUrl({
                      view: "list",
                    });
                  }}
                  className={`px-3 py-2 text-sm ${
                    view === "list"
                      ? "bg-pcb/10 text-pcb"
                      : "text-ink-soft"
                  }`}
                  aria-label="List view"
                >
                  ☰
                </button>

              </div>

            </div>

          </div>


          {/* ==================================================
              SEARCH
             ================================================== */}

          <div className="
            flex
            gap-2
            mb-5
          ">

            <input
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              onKeyDown={(e) => {
                if (
                  e.key === "Enter"
                ) {
                  submitSearch();
                }
              }}
              placeholder="Search products..."
              className="
                flex-1
                border
                border-line
                rounded-lg
                px-4
                py-2.5
                text-sm
              "
            />

            <button
              type="button"
              onClick={submitSearch}
              className="
                btn
                btn-primary
                px-5
              "
            >
              Search
            </button>

          </div>


          {/* ==================================================
              LOADING
             ================================================== */}

          {loading && (

            <div className="
              text-ink-soft
              text-sm
              py-10
            ">
              Loading products…
            </div>

          )}


          {/* ==================================================
              EMPTY
             ================================================== */}

          {!loading &&
            !filtered.length && (

              <div className="
                card
                p-10
                text-center
              ">

                <h3 className="
                  font-semibold
                  mb-2
                ">
                  No products found
                </h3>

                <p className="
                  text-sm
                  text-ink-soft
                  mb-5
                ">
                  Try changing or
                  clearing your
                  filters.
                </p>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="
                    btn
                    btn-primary
                  "
                >
                  Clear filters
                </button>

              </div>

            )}


          {/* ==================================================
              PRODUCTS
             ================================================== */}

          {!loading &&
            filtered.length > 0 && (

              <div
                className={
                  view === "grid"
                    ? `
                      grid
                      grid-cols-1
                      sm:grid-cols-2
                      xl:grid-cols-3
                      gap-5
                    `
                    : `
                      flex
                      flex-col
                      gap-4
                    `
                }
              >
{visible.map(
(product) => {
                    const low =
                      getProductMinPrice(
                        product
                      );

                    const image =
                      product.images?.[0];

                    const inStock =
                      (
                        product.offers ||
                        []
                      ).some(
                        isOfferInStock
                      );

                    const selected =
                      compareIds.includes(
                        product.id
                      );

                    return (

                      <article
                        key={product.id}
                        className={`card hoverable ${
                          view === "grid"
                            ? "p-3.5"
                            : "p-4 flex gap-5"
                        }`}
                      >

                        {/* =================================================
                            IMAGE
                           ================================================= */}

                        <div
                          className={
                            view === "grid"
                              ? "relative"
                              : "relative w-[180px] shrink-0"
                          }
                        >

                          <Link
                            href={`/products/${product.id}`}
                          >

                            <div
                              className={
                                view === "grid"
                                  ? "thumb mb-4"
                                  : "thumb h-[180px]"
                              }
                            >

                              {image ? (

                                <img
                                  src={image}
                                  alt={
                                    product.name
                                  }
                                  className="
                                    w-full
                                    h-full
                                    object-contain
                                  "
                                  loading="lazy"
                                />

                              ) : (

                                <div className="
                                  w-full
                                  h-full
                                  flex
                                  items-center
                                  justify-center
                                  text-ink-soft
                                  text-sm
                                ">
                                  No image
                                </div>

                              )}

                            </div>

                          </Link>


                          {/* Compare */}

                          <label className="
                            absolute
                            top-2
                            left-2
                            bg-white
                            border
                            border-line
                            rounded-lg
                            px-2
                            py-1
                            flex
                            items-center
                            gap-2
                            cursor-pointer
                            shadow-sm
                          ">

                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={
                                compareIds.length >=
                                  4 &&
                                !selected
                              }
                              onChange={() =>
                                toggleCompare(
                                  product.id
                                )
                              }
                              className="accent-pcb"
                            />

                            <span className="
                              text-[11px]
                              font-semibold
                            ">
                              Compare
                            </span>

                          </label>


                          {/* Wishlist */}

                          <button
                            type="button"
                            className="
                              absolute
                              top-2
                              right-2
                              w-9
                              h-9
                              rounded-lg
                              border
                              border-line
                              bg-white
                              text-lg
                              flex
                              items-center
                              justify-center
                              hover:border-pcb
                            "
                            aria-label="Add to wishlist"
onClick={() =>
user
? toggleWishlist(product.id).catch((err) => console.error(err))
: router.push("/login")
}
                            title="Add to wishlist"
                          >
                            {isWishlisted(product.id) ? "♥" : "♡"}
                          </button>

                        </div>


                        {/* =================================================
                            PRODUCT INFO
                           ================================================= */}

                        <div className="
                          min-w-0
                          flex-1
                        ">

                          {/* Category */}

                          <div className="
                            text-[11px]
                            font-bold
                            text-ink-soft
                            uppercase
                            tracking-wide
                            mb-1
                          ">
                            {CAT_LABEL[
                              product.cat
                            ] ||
                              product.cat ||
                              "PRODUCT"}
                          </div>


                          {/* Name */}

                          <Link
                            href={`/products/${product.id}`}
                            className="
                              font-semibold
                              text-[15px]
                              leading-snug
                              line-clamp-2
                              block
                              hover:underline
                              mb-3
                            "
                          >
                            {product.name}
                          </Link>


                          {/* Badges */}

                          <div className="
                            flex
                            flex-wrap
                            gap-2
                            mb-3
                          ">

                            <span className="badge">
                              {CAT_LABEL[
                                product.cat
                              ] ||
                                product.cat}
                            </span>

                            {inStock ? (

                              <span className="
                                badge
                                badge-success
                              ">
                                IN STOCK
                              </span>

                            ) : (

                              <span className="
                                badge
                                badge-outofstock
                              ">
                                OUT OF STOCK
                              </span>

                            )}

                          </div>


                          {/* Price */}

                          <div className="
                            flex
                            items-center
                            justify-between
                            gap-3
                          ">

                            {low !== null ? (

                              <span className="
                                inline-flex
                                items-center
                                px-3
                                py-1
                                rounded-md
                                bg-pcb/10
                                text-pcb
                                font-bold
                              ">
                                {formatPrice(
                                  low
                                )}
                              </span>

                            ) : (

                              <span className="
                                badge
                                badge-outofstock
                              ">
                                {productPriceText(product)}                              </span>

                            )}

                            {Number(
                              product.discount ||
                                0
                            ) > 0 && (

                              <span className="
                                badge
                                badge-discount
                              ">
                                -
                                {
                                  product.discount
                                }
                                %
                              </span>

                            )}

                          </div>


                          {/* Shops */}

                          <div className="
                            text-[11.5px]
                            text-ink-soft
                            mt-3
                          ">
                            {
                              product.offers
                                ?.length || 0
                            }{" "}
                            shop
                            {(
                              product
                                .offers
                                ?.length ||
                              0
                            ) === 1
                              ? ""
                              : "s"}{" "}
                            tracked
                          </div>


                          {/* Actions */}

                          <div className="
                            flex
                            gap-2
                            mt-4
                          ">

                            <button
                              type="button"
                              onClick={() =>
                                toggleCompare(
                                  product.id
                                )
                              }
                              disabled={
                                compareIds.length >=
                                  4 &&
                                !selected
                              }
                              className={`btn btn-sm flex-1 ${
                                selected
                                  ? "btn-primary"
                                  : "btn-ghost"
                              }`}
                            >
                              {selected
                                ? "✓ Selected"
                                : "+ Compare"}
                            </button>

                            <Link
                              href={`/products/${product.id}`}
                              className="
                                btn
                                btn-primary
                                btn-sm
                                flex-1
                                text-center
                              "
                            >
                              View Details
                            </Link>

                          </div>

                        </div>

                      </article>

                    );
                  }
                )}

              </div>

            )}
            {!loading && filtered.length > visibleCount && (
<div className="text-center mt-8">
<button
type="button"
className="btn btn-ghost"
onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
Show more ({filtered.length- visibleCount} left)
</button>
</div>
)}

        </main>

      </div>

    </div>
  );
}

/* ============================================================
   Page
   ============================================================ */

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="
          max-w-[1240px]
          mx-auto
          px-7
          py-8
          text-ink-soft
          text-sm
        ">
          Loading…
        </div>
      }
    >
      <ProductsInner />
    </Suspense>
  );
}