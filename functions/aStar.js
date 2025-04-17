const fs = require('fs');
const path = require('path')
const network = JSON.parse(fs.readFileSync(path.resolve(__dirname, "data/osm_wroclaw_roads.json")));

const heuristic = (a, b) => {
    return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
  };
  
  const addEdge = (edges, from, to, oneway) => {
    const fromKey = JSON.stringify(from);
    const toKey = JSON.stringify(to);
  
    if (!edges.has(fromKey)) edges.set(fromKey, []);
    edges.get(fromKey).push(to);
  
    if (oneway !== "F") {
      if (!edges.has(toKey)) edges.set(toKey, []);
      edges.get(toKey).push(from);
    }
  };
  
  const buildGraph = (network, mode) => {
    let nodes = new Set();
    let edges = new Map();
  
    let allowedClasses;
    if (mode === "bikeFoot") {
      allowedClasses = ["footway", "pedestrian", "path", "cycleway", "steps", "service"];
    } else if (mode === "car") {
      allowedClasses = ["motorway", "trunk", "primary", "secondary", "tertiary", "residential"];
    }
  
    network.features.forEach(feature => {
      if (!allowedClasses.includes(feature.properties.fclass)) return;
  
      if (feature.geometry.type === "MultiLineString") {
        feature.geometry.coordinates.forEach(line => {
          for (let i = 0; i < line.length; i++) {
            const point = line[i];
            const key = JSON.stringify(point);
            nodes.add(key);
  
            if (i > 0) {
              const prevPoint = line[i - 1];
              addEdge(edges, prevPoint, point, feature.properties.oneway);
            }
          }
        });
      }
    });
  
    return { nodes: Array.from(nodes).map(JSON.parse), edges };
  };
  
  const aStar = (start, goal, graph) => {
    const { nodes, edges } = graph;
    const startKey = JSON.stringify(start);
    const goalKey = JSON.stringify(goal);
  
    let openSet = new Set([startKey]);
    let cameFrom = new Map();
    let gScore = new Map(nodes.map(node => [JSON.stringify(node), Infinity]));
    let fScore = new Map(nodes.map(node => [JSON.stringify(node), Infinity]));
  
    gScore.set(startKey, 0);
    fScore.set(startKey, heuristic(start, goal));
  
    while (openSet.size > 0) {
      let current = [...openSet].reduce((a, b) => fScore.get(a) < fScore.get(b) ? a : b);
  
      if (current === goalKey) {
        let path = [];
        while (cameFrom.has(current)) {
          path.push(JSON.parse(current));
          current = cameFrom.get(current);
        }
        path.push(start);
        return path.reverse();
      }
  
      openSet.delete(current);
      let neighbors = edges.get(current) || [];
  
      for (let neighbor of neighbors) {
        let neighborKey = JSON.stringify(neighbor);
        let tentativeGScore = gScore.get(current) + heuristic(JSON.parse(current), neighbor);
  
        if (tentativeGScore < gScore.get(neighborKey)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeGScore);
          fScore.set(neighborKey, tentativeGScore + heuristic(neighbor, goal));
          openSet.add(neighborKey);
        }
      }
    }
  
    return [];
  };
  
  exports.handler = async (event, context) => {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed. Use POST." }),
      };
    }
  
    try {
      const { start, goal, network, mode } = JSON.parse(event.body);
  
      if (!start || !goal || !network || !mode) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Missing required parameters: start, goal, network, mode" }),
        };
      }
  
      const graph = buildGraph(network, mode);
      const path = aStar(start, goal, graph);
  
      return {
        statusCode: 200,
        body: JSON.stringify({ path }),
      };
    } catch (err) {
      console.error("API error:", err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Internal server error" }),
      };
    }
  };