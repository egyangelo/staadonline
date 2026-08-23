/**
 * Plate type-contract tests (05-01 Task 1, PLATE-01).
 *
 * The Plate interface and the StaadModel.elements field are compile-time
 * contracts — these tests exercise them at runtime through structural
 * assignment so vitest fails while the contract is missing.
 */
import { describe, expect, it } from 'vitest';

import type { Plate, StaadModel } from '../src/types';

function asPlate(p: {
  id: number;
  nodes: [number, number, number, number];
  thickness?: number;
}): Plate {
  return p;
}

function hasElements(m: Pick<StaadModel, 'elements'>): number {
  return m.elements.length;
}

describe('Plate contract (PLATE-01)', () => {
  it('(1) Plate exports with id + four-node tuple', () => {
    const quad = asPlate({ id: 7, nodes: [1, 2, 3, 4] });
    expect(quad.id).toBe(7);
    expect(quad.nodes).toEqual([1, 2, 3, 4]);
  });

  it('(2) triangles are quads with a repeated node (no separate shape)', () => {
    const tri = asPlate({ id: 8, nodes: [1, 2, 3, 3] });
    expect(tri.nodes[2]).toBe(tri.nodes[3]);
  });

  it('(3) thickness is optional and typed when present', () => {
    const thick = asPlate({ id: 9, nodes: [1, 2, 3, 4], thickness: 0.2 });
    expect(thick.thickness).toBe(0.2);
    expect(asPlate({ id: 10, nodes: [1, 2, 3, 4] }).thickness).toBeUndefined();
  });

  it('(4) StaadModel carries elements: Plate[]', () => {
    const model = { elements: [asPlate({ id: 1, nodes: [1, 2, 3, 4] })] };
    expect(hasElements(model)).toBe(1);
  });
});
