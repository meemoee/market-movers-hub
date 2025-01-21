interface SpacingConfig {
  baseHorizontalGap: number;
  verticalGap: number;
  nodeWidth: number;
}

export const defaultSpacing: SpacingConfig = {
  baseHorizontalGap: 400,
  verticalGap: 250,
  nodeWidth: 300,
};

export const calculateNodeWidth = (childCount: number, layer: number, config: SpacingConfig = defaultSpacing): number => {
  // Calculate the total width needed for this subtree
  if (childCount === 0) return config.nodeWidth;
  
  // For each layer, we reduce the horizontal gap to create a more compact layout
  const layerScale = Math.max(0.5, 1 - (layer * 0.2));
  const horizontalGap = config.baseHorizontalGap * layerScale;
  
  // The width of a parent must be at least as wide as all its children plus gaps
  return childCount * config.nodeWidth + (childCount - 1) * horizontalGap;
};

export const calculateChildPosition = (
  index: number,
  totalChildren: number,
  parentX: number,
  parentY: number,
  currentLayer: number,
  config: SpacingConfig = defaultSpacing
): { x: number; y: number } => {
  const layerScale = Math.max(0.5, 1 - (currentLayer * 0.2));
  const horizontalGap = config.baseHorizontalGap * layerScale;
  
  // Calculate total width of all children
  const totalWidth = totalChildren * config.nodeWidth + (totalChildren - 1) * horizontalGap;
  
  // Calculate the starting x position (leftmost child)
  const startX = parentX - (totalWidth / 2) + (config.nodeWidth / 2);
  
  // Calculate this child's x position
  const x = startX + index * (config.nodeWidth + horizontalGap);
  
  // Calculate y position
  const y = parentY + config.verticalGap;
  
  return { x, y };
};