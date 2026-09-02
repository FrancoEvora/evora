"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { Crosshair, Layers3, Loader2, Map as MapIcon, Satellite } from "lucide-react";
import type { Opportunity } from "@/lib/malha-data";

const STREET_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const HYBRID_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Imagens © Esri, Maxar e parceiros",
    },
    reference: {
      type: "raster",
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
    },
  },
  layers: [
    { id: "satellite", type: "raster", source: "satellite" },
    { id: "reference", type: "raster", source: "reference", paint: { "raster-opacity": 0.9 } },
  ],
};

function geojson(items: Opportunity[], selectedId: string) {
  return {
    type: "FeatureCollection" as const,
    features: items.map((item) => ({
      type: "Feature" as const,
      properties: { id: item.id, color: item.color, selected: item.id === selectedId ? 1 : 0 },
      geometry: { type: "Polygon" as const, coordinates: [[...item.polygon, item.polygon[0]]] },
    })),
  };
}

type Props = {
  opportunities: Opportunity[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export default function MalhaMap({ opportunities, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const selectRef = useRef(onSelect);
  const itemsRef = useRef(opportunities);
  const selectedRef = useRef(selectedId);
  const [ready, setReady] = useState(false);
  const [style, setStyle] = useState<"hybrid" | "streets">("hybrid");

  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { itemsRef.current = opportunities; }, [opportunities]);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);

  function addOpportunityLayers(map: maplibregl.Map) {
    if (!map.isStyleLoaded()) return;
    const data = geojson(itemsRef.current, selectedRef.current);
    const source = map.getSource("malha-opportunities") as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.addSource("malha-opportunities", { type: "geojson", data });
      map.addLayer({
        id: "malha-opportunity-fill",
        type: "fill",
        source: "malha-opportunities",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["case", ["==", ["get", "selected"], 1], 0.42, 0.24],
        },
      });
      map.addLayer({
        id: "malha-opportunity-line",
        type: "line",
        source: "malha-opportunities",
        paint: {
          "line-color": ["case", ["==", ["get", "selected"], 1], "#ffe1b5", ["get", "color"]],
          "line-width": ["case", ["==", ["get", "selected"], 1], 4, 2],
          "line-opacity": 0.96,
        },
      });
      map.on("mouseenter", "malha-opportunity-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "malha-opportunity-fill", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", "malha-opportunity-fill", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (id) selectRef.current(String(id));
      });
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    itemsRef.current.forEach((item) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `malha-map-pin${item.id === selectedRef.current ? " active" : ""}`;
      el.setAttribute("aria-label", `Selecionar ${item.name}`);
      el.innerHTML = `<span></span>`;
      el.onclick = (event) => { event.stopPropagation(); selectRef.current(item.id); };
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(item.center).addTo(map);
      markersRef.current.set(item.id, marker);
    });
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: HYBRID_STYLE,
      center: [-48.283, -18.936],
      zoom: 10.35,
      minZoom: 4,
      maxZoom: 18,
      attributionControl: {},
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("load", () => { setReady(true); addOpportunityLayers(map); });
    map.on("style.load", () => addOpportunityLayers(map));
    const markers = markersRef.current;
    return () => {
      markers.forEach((marker) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    selectedRef.current = selectedId;
    addOpportunityLayers(map);
    const item = opportunities.find((opportunity) => opportunity.id === selectedId);
    if (item) map.easeTo({ center: item.center, zoom: Math.max(map.getZoom(), 11.1), duration: 900 });
  }, [selectedId, opportunities, ready]);

  function changeStyle(next: "hybrid" | "streets") {
    const map = mapRef.current;
    if (!map || next === style) return;
    setReady(false);
    setStyle(next);
    map.setStyle(next === "hybrid" ? HYBRID_STYLE : STREET_STYLE);
    map.once("style.load", () => { setReady(true); addOpportunityLayers(map); });
  }

  function frameAll() {
    const map = mapRef.current;
    if (!map || !opportunities.length) return;
    const local = opportunities.filter((item) => item.city === "Uberlândia");
    const bounds = new maplibregl.LngLatBounds();
    (local.length ? local : opportunities).forEach((item) => item.polygon.forEach((point) => bounds.extend(point)));
    map.fitBounds(bounds, { padding: 70, duration: 900, maxZoom: 11.2 });
  }

  return (
    <div className="malha-map-wrap">
      <div ref={containerRef} className="malha-map-canvas" />
      {!ready && <div className="malha-map-loading"><Loader2 className="malha-spin" /> Preparando mapa territorial</div>}
      <div className="malha-map-layer-switch" role="group" aria-label="Camada cartográfica">
        <button className={style === "hybrid" ? "active" : ""} onClick={() => changeStyle("hybrid")} title="Satélite"><Satellite /></button>
        <button className={style === "streets" ? "active" : ""} onClick={() => changeStyle("streets")} title="Mapa"><MapIcon /></button>
        <button onClick={frameAll} title="Enquadrar oportunidades"><Crosshair /></button>
        <button title="Camadas territoriais"><Layers3 /></button>
      </div>
    </div>
  );
}
