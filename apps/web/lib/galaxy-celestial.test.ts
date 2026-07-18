import { describe, expect, it } from 'vitest';
import {
  celestialKindForArticleHull,
  celestialKindForConcept,
  celestialKindForTagSatellite,
  celestialScaleForKind,
} from './galaxy-celestial';

describe('galaxy-celestial', () => {
  it('maps source classes to distinct body kinds', () => {
    expect(celestialKindForConcept({ sourceClass: 'catalog_seed' })).toBe('rock');
    expect(celestialKindForConcept({ sourceClass: 'deterministic_placeholder' })).toBe('ember');
    expect(celestialKindForConcept({ sourceClass: 'model_generated', referenceCount: 2 })).toBe(
      'planet',
    );
    expect(celestialKindForConcept({ sourceClass: 'model_generated', referenceCount: 12 })).toBe(
      'comet',
    );
    expect(celestialKindForConcept({ tags: ['hftr:article'] })).toBe('star');
  });

  it('uses moons for tag satellites and stars for article hulls', () => {
    expect(celestialKindForTagSatellite()).toBe('moon');
    expect(celestialKindForArticleHull()).toBe('star');
  });

  it('scales body sizes by kind', () => {
    expect(celestialScaleForKind('star', 1)).toBeGreaterThan(celestialScaleForKind('planet', 1));
    expect(celestialScaleForKind('planet', 1)).toBeGreaterThan(celestialScaleForKind('moon', 1));
    expect(celestialScaleForKind('rock', 1)).toBeGreaterThan(celestialScaleForKind('ember', 1));
  });
});
