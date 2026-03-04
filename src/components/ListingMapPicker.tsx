"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

/* ============================================================
   PROPS
   ============================================================ */
interface ListingMapPickerProps {
  /** Mapbox public token — passed as prop (not process.env) */
  mapboxToken: string;
  /** Current latitude (null if no pin placed) */
  latitude: number | null;
  /** Current longitude (null if no pin placed) */
  longitude: number | null;
  /** Called when user clicks the map to place/move pin */
  onChange: (lat: number, lng: number) => void;
}

// Default center: Phoenix metro area
const PHX_CENTER: [number, number] = [-111.94, 33.45];
const PHX_ZOOM = 9.5;

/* ============================================================
   COMPONENT
   ============================================================ */
export default function ListingMapPicker({
  mapboxToken,
  latitude,
  longitude,
  onChange,
}: ListingMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  // Store onChange in a ref so the map click handler always has the latest
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // ---- Place or move the marker ----
  const placeMarker = useCallback((lat: number, lng: number) => {
    if (!mapRef.current) return;

    if (markerRef.current) {
      // Move existing marker
      markerRef.current.setLngLat([lng, lat]);
    } else {
      // Create new marker — green pin
      markerRef.current = new mapboxgl.Marker({ color: "#8CC644" })
        .setLngLat([lng, lat])
        .addTo(mapRef.current);
    }
  }, []);

  // ---- Initialize map ----
  useEffect(() => {
    if (!containerRef.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    // If there are existing coords, center on them. Otherwise use PHX default.
    const hasCoords = latitude != null && longitude != null;
    const center: [number, number] = hasCoords
      ? [longitude!, latitude!]
      : PHX_CENTER;
    const zoom = hasCoords ? 14 : PHX_ZOOM;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center,
      zoom,
    });

    // Add navigation controls (zoom +/-)
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    mapRef.current = map;

    // Place marker if editing existing listing with coords
    if (hasCoords) {
      map.on("load", () => {
        placeMarker(latitude!, longitude!);
      });
    }

    // Click handler — place/move pin
    map.on("click", (e) => {
      const { lat, lng } = e.lngLat;
      placeMarker(lat, lng);
      onChangeRef.current(lat, lng);
    });

    // Cleanup on unmount
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Only run on mount — coords are handled via placeMarker
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken]);

  return (
    <div>
      {/* Map container */}
      <div
        ref={containerRef}
        className="w-full h-[300px] rounded-btn border border-[#E5E5E5] overflow-hidden"
      />

      {/* Lat/lng display */}
      {latitude != null && longitude != null && (
        <div className="flex items-center gap-4 mt-2 text-xs text-[#777]">
          <span>
            Lat: <span className="text-[#333] font-medium">{latitude.toFixed(6)}</span>
          </span>
          <span>
            Lng: <span className="text-[#333] font-medium">{longitude.toFixed(6)}</span>
          </span>
          <a
            href={`https://www.google.com/maps?q=${latitude},${longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green hover:underline"
          >
            Open in Google Maps
          </a>
        </div>
      )}
      {latitude == null && (
        <p className="text-xs text-[#777] mt-2">
          Click the map to place a pin
        </p>
      )}
    </div>
  );
}
