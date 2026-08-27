"use client";

import { useEffect, useState } from "react";
import { getMatchReview } from "@/lib/data";
import { fmt } from "@/lib/catalog";
import { useAuth } from "@/lib/AuthContext";

function formatCategory(category) {
  if (!category) return "—";
  return String(category).charAt(0).toUpperCase() + String(category).slice(1);
}

function confidenceColor(confidence) {
  if (confidence >= 80) return "#0E7C6B";
  if (confidence >= 65) return "#C98A2C";
  return "#C4472F";
}

function CandidateCard({ candidate, item, acting, resolve }) {
  const confidence =
    candidate.confidence != null
      ? candidate.confidence
      : candidate.score != null
        ? Math.round(candidate.score * 100)
        : null;

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: "#262c35",
        background: "rgba(255,255,255,0.025)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-adminink-soft mb-1">
            Suggested Canonical Product
          </div>

          <div className="text-[15px] font-semibold leading-snug">
            {candidate.name || candidate.productId}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            {confidence != null && (
              <span
                className="text-[11px] font-semibold px-2 py-1 rounded-full"
                style={{
                  color: confidenceColor(confidence),
                  background: `${confidenceColor(confidence)}18`,
                }}
              >
                {confidence}% confidence
              </span>
            )}

            {candidate.dataQuality && (
              <span
                className="text-[11px] px-2 py-1 rounded-full"
                style={{
                  color: "#8B93A1",
                  background: "rgba(139,147,161,0.10)",
                }}
              >
                {candidate.dataQuality} data
              </span>
            )}

            {candidate.offerCount != null && (
              <span
                className="text-[11px] px-2 py-1 rounded-full"
                style={{
                  color: "#8B93A1",
                  background: "rgba(139,147,161,0.10)",
                }}
              >
                {candidate.offerCount} existing offer
                {candidate.offerCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        <button
          disabled={acting === item.id}
          onClick={() =>
            resolve(item.id, "confirm", candidate.productId)
          }
          className="btn btn-sm btn-primary shrink-0"
        >
          {acting === item.id ? "Confirming…" : "Confirm this match"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-adminline">
        <div>
          <div className="text-[10px] uppercase text-adminink-soft">
            Brand
          </div>
          <div className="text-[12.5px] mt-1">
            {candidate.brand || "—"}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase text-adminink-soft">
            Model
          </div>
          <div className="text-[12.5px] mt-1">
            {candidate.model || "—"}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase text-adminink-soft">
            Category
          </div>
          <div className="text-[12.5px] mt-1">
            {formatCategory(candidate.category)}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase text-adminink-soft">
            Lowest price
          </div>
          <div className="text-[12.5px] mt-1 font-semibold">
            {candidate.lowPrice != null
              ? fmt(candidate.lowPrice)
              : "—"}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[10.5px] text-adminink-soft">
        Canonical ID: {candidate.productId}
      </div>
    </div>
  );
}

export default function AdminMatchReview() {
  const { user } = useAuth();

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  const [acting, setActing] = useState(null);
  const [error, setError] = useState("");

  function load() {
    setBusy(true);

    getMatchReview()
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        setError(err.message || "Failed to load match reviews");
      })
      .finally(() => {
        setBusy(false);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function resolve(reviewId, action, productId) {
    setActing(reviewId);
    setError("");

    try {
      const token = await user.getIdToken();

      const res = await fetch("/api/admin/match-review/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reviewId,
          action,
          productId,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to resolve");
      }

      load();
    } catch (err) {
      setError(err.message || "Failed to resolve review");
    } finally {
      setActing(null);
    }
  }

  const pendingCount = items.length;

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-display mb-1">
            Match Review
          </h1>

          <p className="text-adminink-soft text-[12.5px] max-w-3xl">
            Review listings where the ingestion pipeline could not
            confidently determine whether the scraped product matches
            an existing canonical product.
          </p>
        </div>

        <div
          className="text-[12px] px-3 py-2 rounded-lg shrink-0"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid #262c35",
          }}
        >
          <span className="text-adminink-soft">
            Pending reviews
          </span>{" "}
          <span className="font-semibold">{pendingCount}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="admin-card p-3 mb-4 text-[12.5px] rounded-lg"
          style={{ color: "#C4472F" }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {busy && (
        <div className="admin-card p-6 text-adminink-soft text-sm">
          Loading match reviews…
        </div>
      )}

      {/* Empty */}
      {!busy && items.length === 0 && (
        <div className="admin-card p-8 text-center">
          <div className="text-[15px] font-semibold mb-1">
            Nothing pending review
          </div>

          <div className="text-adminink-soft text-sm">
            New ambiguous listings will appear here after ingestion.
          </div>
        </div>
      )}

      {/* Reviews */}
      {!busy && items.length > 0 && (
        <div className="space-y-5">
          {items.map((item) => {
            const listing = item.normalized || {};
            const candidates = item.candidates || [];

            return (
              <div
                key={item.id}
                className="admin-card p-5 md:p-6"
              >
                {/* Review header */}
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className="text-[10.5px] uppercase tracking-wide px-2 py-1 rounded-full"
                        style={{
                          color: "#C98A2C",
                          background: "rgba(201,138,44,0.10)",
                        }}
                      >
                        {item.reason
                          ?.replaceAll("_", " ")
                          ?.replace(/^./, (c) => c.toUpperCase()) ||
                          "Needs review"}
                      </span>

                      <span className="text-[10.5px] text-adminink-soft">
                        Review ID: {item.id}
                      </span>
                    </div>

                    <h2 className="text-[16px] font-semibold leading-snug">
                      {listing.name || "Unnamed listing"}
                    </h2>

                    <div className="text-[12px] text-adminink-soft mt-1">
                      {item.shopName || "Unknown shop"} ·{" "}
                      {listing.brand || "Unknown brand"} ·{" "}
                      {formatCategory(listing.category)}
                    </div>
                  </div>
                </div>

                {/* Scraped listing */}
                <div
                  className="rounded-xl p-4 mb-4"
                  style={{
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid #262c35",
                  }}
                >
                  <div className="text-[10.5px] uppercase tracking-wide text-adminink-soft mb-3">
                    Scraped Listing
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold">
                        {listing.name || "—"}
                      </div>

                      <div className="text-[11.5px] text-adminink-soft mt-1">
                        {item.shopName || "Unknown shop"} ·{" "}
                        {listing.brand || "—"} ·{" "}
                        {formatCategory(listing.category)}
                      </div>

                      {listing.model && (
                        <div className="text-[11.5px] text-adminink-soft mt-1">
                          Model: {listing.model}
                        </div>
                      )}
                    </div>

                    <div className="text-left md:text-right shrink-0">
                      <div className="text-[17px] font-semibold">
                        {listing.price != null
                          ? fmt(listing.price)
                          : "No price"}
                      </div>

                      {listing.previousPrice != null &&
                        listing.previousPrice !== listing.price && (
                          <div className="text-[11px] text-adminink-soft line-through">
                            {fmt(listing.previousPrice)}
                          </div>
                        )}
                    </div>
                  </div>

                  {listing.sourceUrl && (
                    <a
                      href={listing.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block mt-3 text-[11.5px] underline"
                      style={{ color: "#8B93A1" }}
                    >
                      View source listing ↗
                    </a>
                  )}
                </div>

                {/* Candidates */}
                {candidates.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-[13px] font-semibold">
                          Possible Existing Matches
                        </div>

                        <div className="text-[11px] text-adminink-soft mt-0.5">
                          Select the canonical product only if the
                          scraped listing represents the same physical
                          product.
                        </div>
                      </div>

                      <span className="text-[11px] text-adminink-soft">
                        {candidates.length} candidate
                        {candidates.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {candidates.map((candidate) => (
                        <CandidateCard
                          key={candidate.productId}
                          candidate={candidate}
                          item={item}
                          acting={acting}
                          resolve={resolve}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-[12px] text-adminink-soft mb-4">
                    No existing canonical candidates were found.
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-adminline">
                  <button
                    disabled={acting === item.id}
                    onClick={() =>
                      resolve(item.id, "create_new")
                    }
                    className="btn btn-sm"
                  >
                    Create as new product
                  </button>

                  <button
                    disabled={acting === item.id}
                    onClick={() =>
                      resolve(item.id, "reject")
                    }
                    className="btn btn-sm btn-danger"
                  >
                    Reject listing
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}