// cluster code adapted from: https://docs.mapbox.com/mapbox-gl-js/example/cluster-html/

mapboxgl.accessToken = 'pk.eyJ1IjoiYWFiYTAwIiwiYSI6ImNsZzVxaWltcTA1dnczaHFyc3NrZXc4N20ifQ.HHHdXxGVb4zlQcNg1CwEZg';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/dark-v11',
  center: [-73.99330880814004, 40.73762668306899],
  zoom: 10
});


// filters for classifying earthquakes into five categories based on magnitude
const highEmitters = ['>', ['get', 'percent_diff'], 10];
const midEmitters = ['all', ['!=', ['get', 'percent_diff'], 0], ['>=', ['get', 'percent_diff'], -10], ['<=', ['get', 'percent_diff'], 10]];
const lowEmitters = ['<', ['get', 'percent_diff'], -10];
const noData = ['==', ['get', 'percent_diff'], 0];

// colors to use for the categories
const colors = ['#d01c8b', '#f1b6da', '#4dac26', '#adadc9'];

map.on('load', () => {
  map.addSource('EJareas', {
    'type': 'geojson',
    'data': 'https://data.cityofnewyork.us/resource/ykru-djh7.geojson',
  });

  map.addLayer({
    id: 'EJoutline',
    'type': 'fill',
    'source': 'EJareas',
    'paint': {
    }
  });

  //add clustered data source for buildings
  map.addSource('buildingsCluster', {
    'type': 'geojson',
    'data': 'data/2021_energy_multifamily.geojson',
    'cluster': true,
    'clusterRadius': 100,
    'clusterProperties': {
      // keep separate counts for each magnitude category in a cluster
      'highEmitters': ['+', ['case', highEmitters, 1, 0]],
      'midEmitters': ['+', ['case', midEmitters, 1, 0]],
      'lowEmitters': ['+', ['case', lowEmitters, 1, 0]],
      'noData': ['+', ['case', noData, 1, 0]]
    }
  });

  // circle and symbol layers for rendering individual buildings (unclustered points)
  map.addLayer({
    id: 'buildingsCluster_single',
    'type': 'circle',
    'source': 'buildingsCluster',
    'filter': ['!=', 'cluster', true],
    'paint': {
      'circle-color': [
        'case',
        highEmitters,
        colors[0],
        midEmitters,
        colors[1],
        lowEmitters,
        colors[2],
        colors[3]
      ],
      'circle-opacity': 0.6,
      'circle-radius': 8
    }

  });

  //add unclustered data source for buidligns
  map.addSource('buildings', {
    'type': 'geojson',
    'data': 'data/2021_energy_multifamily.geojson',
  });

  //layer of high emitters
  map.addLayer({
    id: 'buildingsPoints_high',
    'type': 'circle',
    'source': 'buildings',
    'filter': highEmitters,
    'layout': {
      'visibility': 'visible'
    },
    'paint': {
      'circle-color': colors[0],
      'circle-radius': 2
    }
  });

  //layer of mid emitters
  map.addLayer({
    id: 'buildingsPoints_mid',
    'type': 'circle',
    'source': 'buildings',
    'filter': midEmitters,
    'layout': {
      'visibility': 'visible'
    },
    'paint': {
      'circle-color': colors[1],
      'circle-radius': 2
    }
  });

  //layer of low emitters
  map.addLayer({
    id: 'buildingsPoints_low',
    'type': 'circle',
    'source': 'buildings',
    'filter': lowEmitters,
    'layout': {
      'visibility': 'visible'
    },
    'paint': {
      'circle-color': colors[2],
      'circle-radius': 2
    }
  });

  //layer of no-data emitters
  map.addLayer({
    id: 'buildingsPoints_noData',
    'type': 'circle',
    'source': 'buildings',
    'filter': noData,
    'layout': {
      'visibility': 'visible'
    },
    'paint': {
      'circle-color': colors[3],
      'circle-radius': 2
    }
  });

  // objects for caching and keeping track of HTML marker objects (for performance)
  const markers = {};
  let markersOnScreen = {};

  function updateMarkers() {
    const newMarkers = {};
    const features = map.querySourceFeatures('buildingsCluster');

    // for every cluster on the screen, create an HTML marker for it (if we didn't yet),
    // and add it to the map if it's not there already
    for (const feature of features) {
      const coords = feature.geometry.coordinates;
      const props = feature.properties;
      if (!props.cluster) continue;
      const id = props.cluster_id;

      let marker = markers[id];
      if (!marker) {
        const el = createDonutChart(props);
        marker = markers[id] = new mapboxgl.Marker({
          element: el
        }).setLngLat(coords);
      }
      newMarkers[id] = marker;

      if (!markersOnScreen[id]) marker.addTo(map);
    }
    // for every marker we've added previously, remove those that are no longer visible
    for (const id in markersOnScreen) {
      if (!newMarkers[id]) markersOnScreen[id].remove();
    }
    markersOnScreen = newMarkers;
  }

  // after the GeoJSON data is loaded, update markers on the screen on every frame
  map.on('render', () => {
    if (!map.isSourceLoaded('buildingsCluster')) return;
    updateMarkers();
  });
});


// functions for creating an SVG donut chart from feature properties
function createDonutChart(props) {
  const offsets = [];
  const counts = [
    props.highEmitters,
    props.midEmitters,
    props.lowEmitters,
    props.noData
  ];
  let total = 0;
  for (const count of counts) {
    offsets.push(total);
    total += count;
  }
  const fontSize =
    total >= 1000 ? 22 : total >= 100 ? 20 : total >= 10 ? 18 : 16;
  const r =
    total >= 1000 ? 50 : total >= 100 ? 32 : total >= 10 ? 24 : 18;
  const r0 = Math.round(r * 0.6);
  const w = r * 2;

  let html = `<div>
<svg width="${w}" height="${w}" viewbox="0 0 ${w} ${w}" text-anchor="middle" style="font: ${fontSize}px sans-serif; display: block">`;

  for (let i = 0; i < counts.length; i++) {
    html += donutSegment(
      offsets[i] / total,
      (offsets[i] + counts[i]) / total,
      r,
      r0,
      colors[i]
    );
  }
  html += `<circle cx="${r}" cy="${r}" r="${r0}" fill="white" opacity="0.3" />
<text dominant-baseline="central" transform="translate(${r}, ${r})">
${total.toLocaleString()}
</text>
</svg>
</div>`;

  const el = document.createElement('div');
  el.innerHTML = html;
  return el.firstChild;
}

function donutSegment(start, end, r, r0, color) {
  if (end - start === 1) end -= 0.00001;
  const a0 = 2 * Math.PI * (start - 0.25);
  const a1 = 2 * Math.PI * (end - 0.25);
  const x0 = Math.cos(a0),
    y0 = Math.sin(a0);
  const x1 = Math.cos(a1),
    y1 = Math.sin(a1);
  const largeArc = end - start > 0.5 ? 1 : 0;

  // draw an SVG path
  return `<path d="M ${r + r0 * x0} ${r + r0 * y0} L ${r + r * x0} ${r + r * y0
    } A ${r} ${r} 0 ${largeArc} 1 ${r + r * x1} ${r + r * y1} L ${r + r0 * x1
    } ${r + r0 * y1} A ${r0} ${r0} 0 ${largeArc} 0 ${r + r0 * x0} ${r + r0 * y0
    }" fill="${color}" />`;
}
