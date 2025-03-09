"use strict";

import "leaflet";
import "leaflet/dist/leaflet.css";

import * as turf from "@turf/turf";

let geoJson;

const FILE_PATH = "./assets/sample.geojson"; // TODO: Change to your GeoJSON file path
const PROPERTY_NAME = "STATEFP"; // TODO: Change to your GeoJSON property name

const main = async () => {
  const map = L.map("map");

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const featureCollection = await getFeatureCollection(FILE_PATH);

  const dissolvedFeatureCollection = dissolveFeatureCollection(
    featureCollection,
    PROPERTY_NAME
  );

  const consolidatedFeatureCollection = consolidateFeatureCollection(
    dissolvedFeatureCollection,
    PROPERTY_NAME
  );

  geoJson = L.geoJson(consolidatedFeatureCollection, {
    onEachFeature: onEachFeature,
  }).addTo(map);
  map.fitBounds(geoJson.getBounds());
};

async function getFeatureCollection(filePath) {
  const response = await fetch(filePath);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data;
}

function dissolveFeatureCollection(featureCollection, propertyName) {
  const polygons = featureCollection.features.filter(
    (feature) => feature.geometry.type === "Polygon"
  );

  const multiPolygons = featureCollection.features.filter(
    (feature) => feature.geometry.type === "MultiPolygon"
  );

  // Break up MultiPolygons into individual Polygons
  const polygonsFromMultiPolygons = multiPolygons.flatMap((feature) => {
    return feature.geometry.coordinates.map((polygonCoords) => ({
      type: "Feature",
      properties: feature.properties,
      geometry: {
        type: "Polygon",
        coordinates: polygonCoords,
      },
    }));
  });

  // Combine all polygons
  const allPolygons = [...polygons, ...polygonsFromMultiPolygons];
  const allPolygonsFeatureCollection = turf.featureCollection(allPolygons);

  // Dissolve polygons into a unified polygon based on the given property name
  const dissolvedFeatureCollection = turf.dissolve(
    allPolygonsFeatureCollection,
    {
      propertyName: propertyName,
    }
  );

  // Return dissolved FeatureCollection
  return dissolvedFeatureCollection;
}

function consolidateFeatureCollection(featureCollection, propertyName) {
  // Group polygons by given property name
  const groupedPolygons = featureCollection.features.reduce(
    (groups, feature) => {
      const key = feature.properties[propertyName];
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(feature);
      return groups;
    },
    {}
  );

  // Create MultiPolygon or Polygon based on the number of polygons in the group, and add into Features array
  const features = [];
  Object.entries(groupedPolygons).forEach(([key, polygons]) => {
    if (polygons.length > 1) {
      const multiPolygon = turf.multiPolygon(
        polygons.map((p) => p.geometry.coordinates),
        {
          [propertyName]: key,
        }
      );
      features.push(multiPolygon);
    } else {
      const polygon = polygons[0];
      features.push(polygon);
    }
  });

  // Return consolidated FeatureCollection
  return turf.featureCollection(features);
}

function onEachFeature(feature, layer) {
  const content = JSON.stringify(feature.properties, null, 2);
  layer.bindTooltip(content);

  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight,
  });
}

function highlightFeature(e) {
  var layer = e.target;

  layer.setStyle({
    weight: 5,
    color: "#666",
    dashArray: "",
    fillOpacity: 0.7,
  });
}

function resetHighlight(e) {
  geoJson.resetStyle(e.target);
}

main();
