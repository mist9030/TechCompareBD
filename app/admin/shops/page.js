"use client";

import { useEffect, useState } from "react";
import {
  getShops,
  addShop,
  deleteShopCascade,
  deleteShop,
  queueScrapeRun,
} from "@/lib/data";
import { useAuth } from "@/lib/AuthContext";
import { fmt } from "@/lib/catalog";

const STATUS_COLOR = {
  active: "#0E7C6B",
  idle: "#8B93A1",
  error: "#C4472F",
  running: "#C98A2C",
};

const empty = {
  name: "",
  url: "",
  logoLetter: "",
};

function formatLastRun(value) {
  if (!value || value === "Never") {
    return "Never";
  }

  // Firestore Timestamp
  if (value?.toDate) {
    return value.toDate().toLocaleString();
  }

  // JS Date
  if (value instanceof Date) {
    return value.toLocaleString();
  }

  // Timestamp-like object
  if (
    typeof value === "object" &&
    value.seconds
  ) {
    return new Date(
      value.seconds * 1000
    ).toLocaleString();
  }

  return String(value);
}

export default function AdminShops() {
  const { user } = useAuth();

  const [shops, setShops] = useState([]);
  const [busy, setBusy] = useState(true);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);

  // Demo scrape
  const [running, setRunning] =
    useState(null);

  /*
   * Firebase sync:
   *
   * shopId
   * shopId:dry
   *
   * Local sync:
   *
   * local:shopId
   * local:shopId:dry
   */
  const [syncing, setSyncing] =
    useState(null);

  const [syncResult, setSyncResult] =
    useState(null);

  /*
   * Local last-run values.
   *
   * This is intentionally browser-side only.
   * It does NOT write anything to Firebase.
   */
  const [localLastRuns, setLocalLastRuns] =
    useState({});

  // ==========================================================
  // LOAD SHOPS
  // ==========================================================

  async function load() {
    try {
      setBusy(true);

      /*
       * Do not keep an old sync error/result
       * while reloading the shop list.
       */
      setSyncResult(null);

      const s = await getShops();

      setShops(
        Array.isArray(s) ? s : []
      );
    } catch (err) {
      console.error(
        "Failed to load shops:",
        err
      );

      setShops([]);

      setSyncResult({
        error:
          err?.message ||
          "Failed to load shops",
      });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // ==========================================================
  // ADD SHOP
  // ==========================================================

  async function submit(e) {
    e.preventDefault();

    try {
      await addShop({
        ...form,

        logoLetter:
          form.logoLetter ||
          form.name?.[0]?.toUpperCase() ||
          "?",

        status: "active",

        lastRun: "Never",

        offers: 0,
      });

      setForm(empty);
      setModal(false);

      await load();
    } catch (err) {
      console.error(
        "Failed to add shop:",
        err
      );

      setSyncResult({
        error:
          err?.message ||
          "Failed to add shop",
      });
    }
  }

  // ==========================================================
  // REMOVE SHOP
  // ==========================================================

  async function remove(id) {
    if (
      !confirm(
        "Remove this shop AND its products? Products sold only by this shop are deleted; products that also have other shops just lose this shop's offer."
)
) {
return;
}
try {
const stats = await deleteShopCascade(id);
alert(`Shop removed. ${stats.removedProducts} product(s) deleted, ${stats.updatedProducts} product(s) updated.`);
await load();
    } catch (err) {
      console.error(
        "Failed to remove shop:",
        err
      );

      setSyncResult({
        shopId: id,
        error:
          err?.message ||
          "Failed to remove shop",
      });
    }
  }

  // ==========================================================
  // DEMO SCRAPE
  // ==========================================================

  async function runScrape(shop) {
    setRunning(shop.id);

    try {
      await queueScrapeRun(shop);
    } catch (err) {
      console.error(
        "Demo scrape failed:",
        err
      );
    } finally {
      setRunning(null);
      await load();
    }
  }

  // ==========================================================
  // FIREBASE REAL SYNC
  // ==========================================================

  async function runRealSync(
    shop,
    dryRun = false
  ) {
    if (!user) {
      setSyncResult({
        shopId: shop.id,
        dryRun,
        error:
          "You must be logged in as an admin.",
      });

      return;
    }

    const syncKey =
      shop.id +
      (dryRun ? ":dry" : "");

    setSyncing(syncKey);

    setSyncResult(null);

    try {
      const token =
        await user.getIdToken(true);

      const res = await fetch(
        "/api/admin/sync",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },

          body: JSON.stringify({
            shopId: shop.id,
            dryRun,
          }),
        }
      );

      const json =
        await res
          .json()
          .catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json?.error ||
            `Sync failed with HTTP ${res.status}`
        );
      }

      setSyncResult({
        shopId: shop.id,
        dryRun,
        source: "firebase",
        ...json,
      });

      /*
       * Only real Firebase sync changes
       * the displayed Last run.
       *
       * Dry run does NOT.
       */
      if (!dryRun) {
        setLocalLastRuns(
          (prev) => ({
            ...prev,
            [shop.id]:
              new Date(),
          })
        );

        await load();

        /*
         * load() clears syncResult,
         * therefore restore it.
         */
        setSyncResult({
          shopId: shop.id,
          dryRun,
          source: "firebase",
          ...json,
        });
      }
    } catch (err) {
      console.error(
        "Firebase sync failed:",
        err
      );

      setSyncResult({
        shopId: shop.id,
        dryRun,
        source: "firebase",
        error:
          err?.message ||
          "Firebase sync failed",
      });
    } finally {
      setSyncing(null);
    }
  }

  // ==========================================================
  // LOCAL SQLITE SYNC
  // ==========================================================

  async function runLocalSync(
    shop,
    dryRun = false
  ) {
    const syncKey =
      "local:" +
      shop.id +
      (dryRun ? ":dry" : "");

    setSyncing(syncKey);

    setSyncResult(null);

    try {
      /*
       * IMPORTANT:
       *
       * No Firebase token.
       * No Firebase Admin.
       *
       * This endpoint talks directly to
       * the server-side SQLite ingestion API.
       */
      const res = await fetch(
        "/api/admin/local-sync",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            shopId: shop.id,
            dryRun,
          }),
        }
      );

      const json =
        await res
          .json()
          .catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json?.error ||
            `Local sync failed with HTTP ${res.status}`
        );
      }

      /*
       * Mark result as LOCAL so UI can
       * clearly distinguish it from Firebase.
       */
      setSyncResult({
        shopId: shop.id,
        dryRun,
        source: "local",
        ...json,
      });

      /*
       * Only actual Local Sync changes
       * browser-side Last run.
       *
       * Verify Local does NOT.
       */
      if (!dryRun) {
        setLocalLastRuns(
          (prev) => ({
            ...prev,
            [shop.id]:
              new Date(),
        })
        );

        /*
         * DO NOT call load() here.
         *
         * getShops() currently reads the
         * shop list from the browser/local
         * shop storage layer.
         *
         * We don't want a local sync to
         * accidentally trigger Firebase.
         */
      }
    } catch (err) {
      console.error(
        "Local sync failed:",
        err
      );

      setSyncResult({
        shopId: shop.id,
        dryRun,
        source: "local",
        error:
          err?.message ||
          "Local sync failed",
      });
    } finally {
      setSyncing(null);
    }
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div>
      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-display">
          Shops
        </h1>

        <button
          onClick={() =>
            setModal(true)
          }
          className="btn btn-primary btn-sm"
        >
          + Add Shop
        </button>
      </div>

      {/* ======================================================
          SHOP LIST
      ====================================================== */}

      {busy ? (
        <div className="text-adminink-soft text-sm">
          Loading...
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {shops.map((s) => {
            /*
             * Firebase states
             */
            const isRealSyncRunning =
              syncing === s.id;

            const isDryRunRunning =
              syncing ===
              s.id + ":dry";

            /*
             * Local states
             */
            const isLocalSyncRunning =
              syncing ===
              "local:" + s.id;

            const isLocalDryRunRunning =
              syncing ===
              "local:" +
                s.id +
                ":dry";

            const isAnythingRunning =
              Boolean(syncing) ||
              running === s.id;

            /*
             * IMPORTANT:
             *
             * Firestore "active" does NOT
             * mean currently running.
             *
             * Running is only displayed while
             * this browser is executing a request.
             */
            let displayStatus =
              s.status || "active";

            if (
              isRealSyncRunning ||
              isDryRunRunning ||
              isLocalSyncRunning ||
              isLocalDryRunRunning ||
              running === s.id
            ) {
              displayStatus =
                "running";
            }

            const lastRun =
              localLastRuns[s.id] ??
              s.lastRun ??
              "Never";

            return (
              <div
                key={s.id}
                className="admin-card p-5"
              >
                {/* ==================================================
                    SHOP NAME
                ================================================== */}

                <div className="flex items-center gap-3 mb-4">
                  <span className="w-[42px] h-[42px] rounded-lg bg-pcb text-white flex items-center justify-center font-display font-bold">
                    {s.logoLetter}
                  </span>

                  <div>
                    <div className="text-[14.5px] font-semibold">
                      {s.name}
                    </div>

                    <div className="text-[11.5px] text-adminink-soft">
                      {s.url}
                    </div>
                  </div>
                </div>

                {/* ==================================================
                    STATUS
                ================================================== */}

                <div className="flex items-center gap-2 mb-4 text-[12.5px]">
                  <span
                    className="status-dot"
                    style={{
                      background:
                        STATUS_COLOR[
                          displayStatus
                        ] ||
                        STATUS_COLOR.active,
                    }}
                  />

                  <span className="capitalize font-semibold">
                    {displayStatus}
                  </span>

                  <span className="text-adminink-soft ml-auto">
                    Last run:{" "}
                    {formatLastRun(
                      lastRun
                    )}
                  </span>
                </div>

                {/* ==================================================
                    ACTION BUTTONS
                ================================================== */}

                <div className="flex gap-2 flex-wrap">
                  {/* ==================================================
                      EXISTING FIREBASE BUTTON
                  ================================================== */}

                  <button
                    onClick={() =>
                      runRealSync(
                        s,
                        false
                      )
                    }
                    disabled={
                      isAnythingRunning
                    }
                    className="btn btn-sm btn-primary flex-1 justify-center"
                    title="Discover, parse and write real product data to Firestore"
                  >
                    {isRealSyncRunning
                      ? "Syncing..."
                      : "Sync Real Data"}
                  </button>

                  {/* ==================================================
                      EXISTING FIREBASE DRY RUN
                  ================================================== */}

                  <button
                    onClick={() =>
                      runRealSync(
                        s,
                        true
                      )
                    }
                    disabled={
                      isAnythingRunning
                    }
                    className="btn btn-sm flex-1 justify-center"
                    title="Run the complete Firebase ingestion pipeline without writing anything"
                  >
                    {isDryRunRunning
                      ? "Verifying..."
                      : "Verify (Dry Run)"}
                  </button>

                  {/* ==================================================
                      NEW LOCAL SQLITE SYNC
                  ================================================== */}

                  <button
                    onClick={() =>
                      runLocalSync(
                        s,
                        false
                      )
                    }
                    disabled={
                      isAnythingRunning
                    }
                    className="btn btn-sm flex-1 justify-center"
                    style={{
                      border:
                        "1px solid #0E7C6B",
                    }}
                    title="Sync real product data into the local SQLite database. Firebase is not used."
                  >
                    {isLocalSyncRunning
                      ? "Local Syncing..."
                      : "Sync Local"}
                  </button>

                  {/* ==================================================
                      NEW LOCAL SQLITE VERIFY
                  ================================================== */}

                  <button
                    onClick={() =>
                      runLocalSync(
                        s,
                        true
                      )
                    }
                    disabled={
                      isAnythingRunning
                    }
                    className="btn btn-sm flex-1 justify-center"
                    title="Run discovery, parsing, normalization and matching locally without writing SQLite data."
                  >
                    {isLocalDryRunRunning
                      ? "Checking..."
                      : "Verify Local"}
                  </button>

                  {/* ==================================================
                      EXISTING DEMO
                  ================================================== */}

                  <button
                    onClick={() =>
                      runScrape(s)
                    }
                    disabled={
                      isAnythingRunning
                    }
                    className="btn btn-sm flex-1 justify-center"
                  >
                    {running ===
                    s.id
                      ? "Running..."
                      : "Simulate (Demo)"}
                  </button>

                  {/* ==================================================
                      EXISTING REMOVE
                  ================================================== */}

                  <button
                    onClick={() =>
                      remove(s.id)
                    }
                    disabled={
                      isAnythingRunning
                    }
                    className="btn btn-sm btn-danger"
                  >
                    Remove
                  </button>
                </div>

                {/* ==================================================
                    RESULT
                ================================================== */}

                {syncResult?.shopId ===
                  s.id && (
                  <div
                    className="mt-3 text-[11.5px] rounded-md p-2.5"
                    style={{
                      background:
                        "rgba(255,255,255,0.04)",
                    }}
                  >
                    {/* SOURCE BADGE */}

                    {!syncResult.error && (
                      <div className="mb-1">
                        <span
                          className="font-semibold"
                          style={{
                            color:
                              syncResult.source ===
                              "local"
                                ? "#0E7C6B"
                                : "#C98A2C",
                          }}
                        >
                          {syncResult.source ===
                          "local"
                            ? "[LOCAL SQLITE]"
                            : "[FIREBASE]"}
                        </span>
                      </div>
                    )}

                    {/* ERROR */}

                    {syncResult.error ? (
                      <span
                        style={{
                          color:
                            "#C4472F",
                        }}
                      >
                        {syncResult.error}
                      </span>
                    ) : (
                      <>
                        {/* SUMMARY */}

                        <div className="text-adminink-soft">
                          {syncResult.dryRun && (
                            <span className="font-semibold">
                              [Dry run - nothing written]{" "}
                            </span>
                          )}

                          Discovered{" "}
                          {syncResult.discovered ??
                            0}

                          {" · "}

                          {syncResult.dryRun
                            ? "would-create"
                            : "created"}{" "}
                          {syncResult.created ??
                            0}

                          {" · matched "}

                          {syncResult.matched ??
                            0}

                          {" · ambiguous "}

                          {syncResult.ambiguous ??
                            0}

                          {" · skipped "}

                          {syncResult.skipped ??
                            0}

                          {" · failed "}

                          {syncResult.failed ??
                            0}

                          {syncResult.updated !=
                            null && (
                            <>
                              {" · updated "}
                              {
                                syncResult.updated
                              }
                            </>
                          )}
                        </div>

                        {/* ==================================================
                            LOCAL DATABASE INFO
                        ================================================== */}

                        {syncResult.source ===
                          "local" && (
                          <div className="mt-1 text-adminink-soft">
                            Database:{" "}
                            <span className="font-semibold">
                              SQLite
                            </span>
                            {" · "}
                            Firebase writes:{" "}
                            <span className="font-semibold">
                              None
                            </span>
                          </div>
                        )}

                        {/* ==================================================
                            PREVIEW
                        ================================================== */}

                        {syncResult.dryRun &&
                          Array.isArray(
                            syncResult.preview
                          ) &&
                          syncResult.preview
                            .length >
                            0 && (
                            <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                              {syncResult.preview
                                .slice(
                                  0,
                                  20
                                )
                                .map(
                                  (
                                    p,
                                    i
                                  ) => (
                                    <li
                                      key={
                                        i
                                      }
                                      className="text-adminink-soft"
                                    >
                                      <span className="capitalize font-semibold">
                                        {p.decision?.replaceAll(
                                          "_",
                                          " "
                                        )}
                                      </span>

                                      {p.name ? (
                                        <>
                                          :{" "}
                                          {
                                            p.name
                                          }
                                        </>
                                      ) : null}

                                      {p.brand ? (
                                        <>
                                          {" · "}
                                          {
                                            p.brand
                                          }
                                        </>
                                      ) : null}

                                      {p.model ? (
                                        <>
                                          {" · "}
                                          {
                                            p.model
                                          }
                                        </>
                                      ) : null}

                                      {p.price !=
                                      null ? (
                                        <>
                                          {" - "}
                                          {fmt
                                            ? fmt(
                                                p.price
                                              )
                                            : `৳${p.price}`}
                                        </>
                                      ) : null}

                                      {p.reason ? (
                                        <>
                                          {" · "}
                                          {
                                            p.reason
                                          }
                                        </>
                                      ) : null}
                                    </li>
                                  )
                                )}
                            </ul>
                          )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================
          ADD SHOP MODAL
      ======================================================== */}

      {modal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() =>
            setModal(false)
          }
        >
          <form
            onSubmit={submit}
            className="admin-card w-full max-w-sm p-5"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <h2 className="text-[15px] font-display mb-4">
              Add Shop
            </h2>

            <div className="space-y-3">
              {/* NAME */}

              <div>
                <label className="text-[11.5px] text-adminink-soft">
                  Name
                </label>

                <input
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      name:
                        e.target
                          .value,
                    })
                  }
                  className="w-full bg-transparent border border-adminline rounded-md px-2 py-1.5 text-sm mt-1"
                />
              </div>

              {/* WEBSITE */}

              <div>
                <label className="text-[11.5px] text-adminink-soft">
                  Website
                </label>

                <input
                  required
                  value={form.url}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      url:
                        e.target
                          .value,
                    })
                  }
                  placeholder="example.com"
                  className="w-full bg-transparent border border-adminline rounded-md px-2 py-1.5 text-sm mt-1"
                />

                <div className="text-[11px] text-adminink-soft mt-1">
                  Sync Real Data uses
                  the registered Firebase
                  ingestion adapter.
                  <br />
                  Sync Local uses the
                  same retailer adapter
                  but writes to SQLite.
                  <br />
                  Registered:
                  startech.com.bd,
                  ucc.com.bd,
                  onixbd.com,
                  creatus.com.bd,
                  globalbrand.com.bd.
                </div>
              </div>
            </div>

            {/* MODAL BUTTONS */}

            <div className="flex gap-2 justify-end mt-5">
              <button
                type="button"
                onClick={() =>
                  setModal(false)
                }
                className="btn btn-sm"
                style={{
                  background:
                    "none",

                  border:
                    "1px solid #262c35",

                  color:
                    "#e7e9ec",
                }}
              >
                Cancel
              </button>

              <button
                className="btn btn-sm btn-primary"
                type="submit"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}