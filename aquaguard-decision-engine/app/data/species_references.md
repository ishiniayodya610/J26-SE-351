# Reference Sources for Real Data

To expand this dataset accurately toward the final **10–15 species goal**, use the following authoritative databases to find exact environmental boundaries, bioload factors, and behavioral traits:

---

## 📚 Primary Database References

### 1. [Seriously Fish](https://www.seriouslyfish.com) (`seriouslyfish.com`)
- **Primary Use:** The gold standard for scientific and technical aquarium data.
- **Parameters to Extract:**
  - Exact pH tolerances and optimal ranges
  - Temperature ranges based on wild habitat
  - General Hardness (dGH) and Carbonate Hardness (dKH)
  - Natural substrate and current preferences

### 2. [FishBase](https://www.fishbase.se) (`fishbase.se`)
- **Primary Use:** Global scientific species database curated by ichthyologists and marine biologists.
- **Parameters to Extract:**
  - Exact maximum standard/total lengths (crucial for bioload & minimum tank volume calculations)
  - Temperature tolerances and geographical distribution
  - Trophic level and diet composition

### 3. [Aquarium Co-Op Care Guides](https://www.aquariumcoop.com) (`aquariumcoop.com`)
- **Primary Use:** Practical, empirical data and husbandry guides from experienced hobbyists.
- **Parameters to Extract:**
  - Male-to-female breeding ratios (e.g., livebearer harem management)
  - Community compatibility and fin-nipping tendencies
  - Temperament and spatial water-column distribution (Top, Middle, Bottom)

### 4. [The IUCN Red List](https://www.iucnredlist.org) (`iucnredlist.org`)
- **Primary Use:** Global inventory of the conservation status and wild habitat conditions of biological species.
- **Parameters to Extract:**
  - Native river basin hydrology and baseline water chemistry
  - Verification of natural habitat TDS (Total Dissolved Solids) and seasonal pH fluctuations

---

## 📋 Schema Template for Future Additions

When adding new species to `species_seed.json`, adhere strictly to this JSON format:

```json
{
  "species_id": "scientific_name_lowercase_snake_case",
  "common_name": "Common English Name",
  "temperament": "peaceful | peaceful to semi-aggressive | semi-aggressive | aggressive",
  "environment": {
    "temperature": {
      "min": 0.0,
      "optimal_min": 0.0,
      "optimal_max": 0.0,
      "max": 0.0
    },
    "ph": {
      "min": 0.0,
      "optimal_min": 0.0,
      "optimal_max": 0.0,
      "max": 0.0
    },
    "tds": {
      "min": 0.0,
      "optimal_min": 0.0,
      "optimal_max": 0.0,
      "max": 0.0
    }
  },
  "behavior": {
    "aggression": 1,
    "fin_nipping": false,
    "territorial": false
  },
  "spatial": {
    "zones": ["Top", "Middle", "Bottom"]
  },
  "breeding": {
    "type": "livebearer | egglayer | mouthbrooder",
    "male_female_ratio": 1.0
  },
  "compatibility": {
    "target_species_id": "low_risk | moderate_risk | high_risk"
  }
}
```

### Parameter Guidelines
- **`aggression`**: Numerical index from `1` (completely passive) to `10` (highly predatory/hyper-aggressive).
- **`fin_nipping`**: Boolean flag indicating propensity to nip long flowing fins (e.g., guppies, bettas, angelfish).
- **`territorial`**: Boolean flag indicating area-defense behaviors (especially among males).
- **`zones`**: Primary swimming layers: `"Top"`, `"Middle"`, `"Bottom"`.
- **`male_female_ratio`**: Number of females recommended per male (e.g. `3.0` indicates 1M:3F; `0.0` indicates solitary housing).
