# Path of Exile 1 — Complete Crafting Mechanics Guide (2026)

**Generated:** 2026-05-25  
**Source:** Project codebase analysis + PoE Wiki + PoEDB  
**Purpose:** Build a craft calculator (Markov Decision Process solver)

---

## TABLE OF CONTENTS

1. [Currency Items Mechanics](#1-currency-items)
2. [Essence Crafting](#2-essence-crafting)
3. [Fossil Crafting](#3-fossil-crafting)
4. [Metamod Crafting (Crafting Bench)](#4-metamod-crafting)
5. [Bench Crafting](#5-bench-crafting)
6. [Harvest Crafting](#6-harvest-crafting)
7. [Aisling / Veiled Mods](#7-aisling--veiled-mods)
8. [Fracturing](#8-fracturing)
9. [Recombinator](#9-recombinator)
10. [Mod Spawning Rules](#10-mod-spawning-rules)
11. [Critical Interactions Summary](#11-critical-interactions-summary)
12. [Probability Distributions](#12-probability-distributions)

---

## 1. CURRENCY ITEMS

### 1.1 Chaos Orb

**Mechanic:** Rerolls ALL explicit mods on a rare item.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Rare items only                  |
| What Changes                | All explicit mods (prefixes + suffixes) |
| Item Level                  | Preserved                        |
| Influence                   | Preserved                        |
| Metamod Interaction         | RESPECTS locks (see section 11) |
| Bench Craft                 | REMOVES bench craft              |
+-----------------------------+----------------------------------+
```

**Behavior:**
- Generates a FRESH roll of 4-6 mods based on `MOD_COUNT_DISTRIBUTION`
- Rerolls EVERYTHING in unlocked slots
- If both prefix AND suffix are locked via metamod: **Chaos does nothing**
- If only prefixes locked: **Only suffixes reroll**
- If only suffixes locked: **Only prefixes reroll**

### 1.2 Exalted Orb

**Mechanic:** Adds a NEW random mod to an unlocked slot.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Rare items (or magic with Regal) |
| What Changes                | Adds 1 NEW random mod            |
| Metamod Interaction         | RESPEITS locks                  |
| Slot Selection              | Random unlocked slot             |
+-----------------------------+----------------------------------+
```

**Behavior:**
- Adds ONE mod to an unlocked slot
- CANNOT add mod if all 3 prefix slots AND all 3 suffix slots are full
- Respects metamods (won't add to locked slots)
- Weight-based selection of mod type (prefix vs suffix)

### 1.3 Orb of Annulment

**Mechanic:** Removes ONE random unlocked mod.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Rare items with explicit mods     |
| What Changes                | Removes exactly 1 mod            |
| Metamod Interaction         | RESPECTS locks                   |
| Cannot Annul                | Implicit mods, enchantments, fractured |
+-----------------------------+----------------------------------+
```

**Behavior:**
- **Uniform random selection** among all unlocked mods
- Equal probability for all unlocked mods (not weight-based)
- Metamods protect: Annul cannot remove locked mods
- If NO unlocked mods exist: **Annul does nothing** (item unchanged)

### 1.4 Divine Orb

**Mechanism:** Redistributes the values of existing mods.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Explicit mods with ranges        |
| What Changes                | Rerolls VALUE, not mods themselves |
| Metamod Interaction         | N/A (no mod added/removed)      |
| Implicit                    | NOT affected                     |
+-----------------------------+----------------------------------+
```

**Behavior:**
- For each mod with a value range (e.g., 40-70 life): rerolls to a new random value in that range
- Does NOT add or remove mods
- Does NOT affect implicits
- Used to optimize mod values (e.g., get max life roll)

### 1.5 Orb of Alteration

**Mechanic:** Rerolls a magic item completely.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Magic items ONLY                 |
| Result                      | 1 prefix + 1 suffix (always)     |
| Mod Count                   | Exactly 2 (1 prefix + 1 suffix)  |
+-----------------------------+----------------------------------+
```

**Behavior:**
- Magic item = exactly 2 mods (1 prefix, 1 suffix)
- Completely rerolls both mods
- Does NOT promote to rare (use Regal Orb for that)

### 1.6 Orb of Augmentation

**Mechanic:** Adds ONE random mod to a magic item.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Magic items with 1 mod           |
| What Adds                   | 1 random mod (prefix OR suffix) |
| Result                      | 2 mods (becomes full magic)     |
+-----------------------------+----------------------------------+
```

**Behavior:**
- Only works on magic items with exactly 1 mod
- Adds either prefix or suffix (weight-based)
- Cannot use on 2-mod magic items or rare items

### 1.7 Regal Orb

**Mechanic:** Upgrades a magic item to rare.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Magic items                      |
| Result                      | Becomes rare with 3 mods         |
| Preserves                   | Existing magic mods              |
| Adds                        | 2 additional random mods         |
+-----------------------------+----------------------------------+
```

**Behavior:**
- Keeps existing magic mod
- Adds 2 more random mods (4 total possible, but typical distribution applies)
- Item becomes rare (can have 6 mods total)

### 1.8 Orb of Scouring

**Mechanic:** Removes ALL explicit mods.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Rare, magic items                |
| Removes                     | ALL explicit mods                |
| Preserves                   | Implicit, enchantment, fractured |
| Metamod Interaction         | RESPECTS locks??? (see below)   |
+-----------------------------+----------------------------------+
```

**Behavior:**
- Converts item to white (no explicit mods)
- Metamod interaction: **Scouring REMOVES metamod along with all mods**
- Does NOT respect "cannot be changed" locks
- Bench craft is also removed

### 1.9 Blessed Orb

**Mechanic:** Rerolls the values of "Blessed" mods.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Mods with "Blessed" tag          |
| Examples                    | resistances with "Blessed" prefix |
| What Changes                | Value within mod range           |
+-----------------------------+----------------------------------+
```

**Behavior:**
- Specific mods have "blessed" variants
- Rerolls value to potentially higher values
- Less common in current PoE

### 1.10 Orb of Chance

**Mechanic:** Attempts to transform into a unique item.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Any equipment item               |
| Result                      | Unique version OR unchanged      |
| Probability                 | Varies by base type              |
+-----------------------------+----------------------------------+
```

**Behavior:**
- Success rate varies by base type
- If fails: item unchanged
- Does not corrupt the item

### 1.11 Vaal Orb

**Mechanic:** Corrupts an item with random implicit or explicit mods.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Non-corrupted items              |
| Result                      | Becomes CORRUPTED (cannot be rerolled) |
| Possible Effects            | Added Vaal implicit, new mods, worse mods |
| Sockets                     | Can randomize socket count/color |
+-----------------------------+----------------------------------+
```

**Behavior:**
- Item becomes permanently corrupted
- Cannot use currency on corrupted items
- Risk of making item worse

---

## 2. ESSENCE CRAFTING

### 2.1 Core Mechanic

**Essences GUARANTEE one specific mod** from a fixed pool per item class.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Normal, magic, rare items       |
| Guaranteed Mod              | Yes — one essence mod            |
| Other Mods                  | Rerolls like chaos (unlocked)    |
| Item Becomes                | Always rare                      |
| Can Brick                   | No                               |
+-----------------------------+----------------------------------+
```

### 2.2 Tier System (Essence Power)

| Level | Name          | Description              | Stat Range |
|-------|---------------|--------------------------|------------|
| 1     | Whispering    | Weakest                  | Low values |
| 2     | Muttering     |                          |            |
| 3     | Weeping       |                          |            |
| 4     | Wailing       |                          |            |
| 5     | Screaming     | Most common              | Mid values |
| 6     | Shrieking     |                          |            |
| 7     | Deafening     | Strongest regular        | High values|
| 8     | Corruption-only| Horror, Insanity, etc.   | Special    |

**Higher tier = Higher stat values (wider ranges, higher floors)**

### 2.3 Essence Family vs. Power Tier

The database has TWO tier concepts:

```sql
-- "tier" in database = FAMILY (Hatred=1, Anger=2, etc.)
-- "level" in database = POWER (1=Whispering, 7=Deafening)

SELECT name, tier, level FROM essences LIMIT 20;
-- name: "Whispering Essence of Hatred"
-- tier: 1 (family ID)
-- level: 1 (power)
```

### 2.4 What Essence Gives What Mod

Essences are CLASS-SPECIFIC. Each essence-item_class combination gives a different mod.

**Example — Life Essence:**
```
Essence of Greed on Body Armour → +# to maximum life
Essence of Greed on Helmet      → +# to maximum life  
Essence of Greed on Gloves      → +# to maximum life
Essence of Greed on Boots       → +# to maximum life
Essence of Greed on Ring        → +# to maximum life (different mod pool)
```

### 2.5 Using Essence on Rare Items

**YES, you can use essence on already-rare items!**

When applied to a rare:
1. Essence mod is guaranteed
2. Other mods reroll (like chaos) for unlocked slots
3. Locked slots (via metamod) are PRESERVED

### 2.6 Database Query Example

```sql
-- What does Essence of Hatred give on body armours?
SELECT m.name, m.generation_type, m.stats
FROM essences e
JOIN essence_mods em ON em.essence_id = e.id
JOIN mods m ON m.id = em.mod_id
JOIN item_classes ic ON ic.id = em.item_class_id
WHERE e.name LIKE '%Hatred%' 
  AND ic.name = 'Body Armours';
```

---

## 3. FOSSIL CRAFTING

### 3.1 Core Mechanic

Fossils modify **spawn weights** of mods, making certain mods more or less likely to appear.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Works On                    | Normal, magic, rare items        |
| Socketed In                 | Resonator (1-4 sockets)          |
| Mods Added                  | 4-6 (same as chaos)             |
| Weight Modification          | Yes — by tag                    |
| Tags Blocked                | Some fossils block entire tag categories |
+-----------------------------+----------------------------------+
```

### 3.2 Resonator Types

| Resonator    | Sockets | Fossils | Cost      |
|--------------|---------|---------|-----------|
| Primitive    | 1       | 1       | Cheap     |
| Pentagram     | 2       | 2       | Moderate  |
| Sanctified    | 3       | 3       | Expensive |
| Primordial    | 4       | 4       | Expensive |

### 3.3 Fossil Weight Modifier System

**How it works:**

Each fossil has weight modifiers per TAG:

```python
# Example: Dense Fossil
fossil_weight_modifiers = [
    {"tag": "cold", "multiplier": +500, "is_positive": True},
    {"tag": "fire", "multiplier": 0, "is_positive": False},  # BLOCKED
    {"tag": "lightning", "multiplier": 0, "is_positive": False},  # BLOCKED
]
```

**Resolution Algorithm:**

1. Start with base spawn weight from mod
2. For each fossil applied:
   - **Positive modifier**: ADD bonus weight to mods with that tag
   - **Negative modifier**: SET weight to that value (0 = blocked)

3. If ANY fossil blocks a tag the mod has → weight = 0

### 3.4 Known Fossil Combinations

| Combo          | Effect                                      |
|----------------|---------------------------------------------|
| Dense + Corr.  | Life + resist (fire blocked)                |
| Faceted + Temp | High-level spell gems                       |
| Pristine       | Life mods                                   |
| Shuddering     | Attack speed, cast speed                    |
| Serrated       | Physical damage                             |
| Aetheric       | Chaos resistance, chaos damage             |

### 3.5 Database Structure

```sql
-- Fossils and their modifiers
SELECT f.name, t.name as tag, fwm.multiplier, fwm.is_positive
FROM fossil_weight_modifiers fwm
JOIN fossils f ON f.id = fwm.fossil_id
JOIN tags t ON t.id = fwm.tag_id
WHERE f.name = 'Dense Fossil';

-- Blocked tags
SELECT f.name, t.name
FROM fossil_blocked_tags fbt
JOIN fossils f ON f.id = fbt.fossil_id
JOIN tags t ON t.id = fbt.tag_id;
```

---

## 4. METAMOD CRAFTING (Crafting Bench)

### 4.1 Available Metamods

| Metamod                        | Cost      | Effect                              |
|---------------------------------|-----------|-------------------------------------|
| Prefixes Cannot Be Changed      | 2 Exalted | Cannot remove/add prefix mods       |
| Suffixes Cannot Be Changed      | 2 Exalted | Cannot remove/add suffix mods       |
| Cannot Roll Attack Modifiers    | 2 Exalted | Only caster/utility mods can spawn  |
| Cannot Roll Caster Modifiers    | 2 Exalted | Only attack/utility mods can spawn  |
| Cannot Roll Attack/Caster       | 2 Exalted | Only utility mods can spawn         |

### 4.2 What Metamods Block

**"Prefixes Cannot Be Changed":**
- Cannot be removed by Annulment
- Cannot be added by Exalted/Chaos
- Can be REROLLED by Chaos (but not removed)
- Essence CAN add prefix (but rerolls existing?)

**"Suffixes Cannot Be Changed":**
- Same as above, for suffixes

### 4.3 Stacking Metamods

**YES, you can use both simultaneously:**
- "Prefixes Cannot Be Changed" + "Suffixes Cannot Be Changed"
- Result: Item is completely locked from modification
- Only bench craft can add (one more mod, then FULL)

### 4.4 Metamod Costs

```python
# From cost.py
exalt_price = 100  # default if not found
metamod_cost = 2 * exalt_price  # 200 chaos
```

---

## 5. BENCH CRAFTING

### 5.1 Core Mechanic

**Adds exactly ONE fixed mod** to an item.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Mod Added                   | 1 specific mod (selected from list) |
| Generation Type             | Either prefix or suffix          |
| Can Overwrite               | YES — one bench craft at a time  |
| Costs                       | Currency (varies by mod tier)    |
+-----------------------------+----------------------------------+
```

### 5.2 Bench Craft Behavior

1. Select a mod from the bench menu
2. Mod is added as explicit mod
3. **If item already has bench craft**: OLD bench craft is REMOVED
4. Item becomes rare if it was magic
5. Bench craft does NOT count toward "cannot be changed" for metamods

### 5.3 Bench Craft vs. Metamods

Bench craft is special:
- **Does NOT respect** "Prefixes/Suffixes Cannot Be Changed"
- **Can be removed** by Scouring
- **Can be overwritten** by another bench craft
- **Is NOT preserved** by any lock mechanic

### 5.4 Cost Structure

```python
# From policy_models.py
bench_craft_cost = 2.0  # chaos equivalent
```

Typical costs:
- Common mods: 1-2 chaos
- Rare mods: 5-20 chaos
- Influenced mods: 20+ chaos

---

## 6. HARVEST CRAFTING

### 6.1 Core Mechanic

Harvest crafts are **tag-based reforging** operations from the Horticrafting Station.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Location                    | Horticrafting Station            |
| Uses                        | Lifeforce (Wild/Primal/Vivid)    |
| Type                        | Tag-based reforge operations      |
+-----------------------------+----------------------------------+
```

### 6.2 Tag-Based Reforge Operations

| Operation                           | Effect                                        |
|-------------------------------------|-----------------------------------------------|
| Reforge with [Tag]                  | Random mod with that tag (biased)             |
| Reforge keeping Prefixes            | Keep prefixes, reroll suffixes                 |
| Reforge keeping Suffixes            | Keep suffixes, reroll prefixes                 |
| Remove [Tag], Add [Tag]             | Remove one, add one with tag                   |
| Remove Random Mod                   | Remove one random mod                         |

### 6.3 "Reforge Keeping Prefix/Suffix"

**How it works mechanically:**

1. Identify which mods are prefixes/suffixes
2. **Preserve** those mods
3. **Remove** all mods of the other type
4. **Add** new mods (reforge)

```
Example: "Reforge keeping suffixes"
Before: [Life P1] [Resist S1] [Damage P2] [Mana P3]
Keep: [Resist S1]
Remove: [Life P1], [Damage P2], [Mana P3]
Add: New prefix mods (fresh roll)
```

### 6.4 Tag Bias in Reforge

Harvest reforge uses **weighted random selection** biased toward the specified tag:
- Higher tier mods with that tag = higher weight
- Lower tier or no tag = lower weight

### 6.5 Lifeforce Types

| Lifeforce    | Color  | Source                  |
|--------------|--------|------------------------|
| Wild         | Green  | Common harvests        |
| Primal       | Blue   | Tainted currencies     |
| Vivid        | Red    | Boss encounters        |

---

## 7. AISLING / VEILED MODS

### 7.1 Core Mechanic

**Aisling T4** adds a veiled mod that must be unveiled by crafting.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Source                      | Aisling T4 at Research           |
| Result                      | Adds 1 veiled mod                 |
| Unveil                      | Use any currency to reveal        |
| Metamod Interaction         | Can use with metamods            |
+-----------------------------+----------------------------------+
```

### 7.2 How Aisling Works

1. **Apply Aisling** → Adds veiled mod to item
2. **Unveil** → Click the veiled mod repeatedly to reveal options
3. **Select one** → That mod stays, others removed
4. **Result** → One unveiled mod becomes permanent

### 7.3 Veiled Mod Pool

Veiled mods include:
- Crafted modifiers (prefix/suffix)
- Master-specific mods (e.g., "Nearby enemies have -X% to all resistances")

### 7.4 Interaction with Metamods

**Aisling respects metamods:**
- If prefixes locked → veiled mod will be suffix
- If suffixes locked → veiled mod will be prefix

### 7.5 Cost Calculation

```
Aisling T4 = ~60-80 chaos equivalent
Expected unveils = 3-4 attempts to find good mod
Total cost = ~200-300 chaos for good veiled craft
```

---

## 8. FRACTURING

### 8.1 Fractured Mods

**Fractured mods are permanently locked** and cannot be modified.

```
+-----------------------------+----------------------------------+
| Property                    | Value                            |
+-----------------------------+----------------------------------+
| Source                      | Fracturing Orb                   |
| Effect                      | One mod becomes "Fractured"      |
| Behavior                    | CANNOT be removed by ANYTHING    |
| Annulment                   | CANNOT remove fractured mods      |
| Scouring                    | CANNOT remove fractured mods      |
| Chaos                       | CANNOT modify fractured mods      |
+-----------------------------+----------------------------------+
```

### 8.2 Fracturing Orb

**Guarantees fracture of a specific mod type:**
- Fracturing Orb of your choice → pick which mod to fracture
- Specific fossils → certain mods get fractured

### 8.3 Fracturing vs. Metamods

| Action              | Fractured Mod | Metamod Lock |
|---------------------|---------------|--------------|
| Annulment           | Protected     | Protected    |
| Scouring            | Protected     | NOT protected|
| Chaos               | Protected     | Respects     |
| Exalted             | Protected     | Respects     |
| Essence             | Protected     | Respects     |

**Key Difference:** Fractured is STRONGER than metamod.

---

## 9. RECOMBINATOR

### 9.1 Does It Exist in PoE1?

**NO** — Recombinators were introduced in **Path of Exile 2 (PoE2)**.

PoE1 does NOT have item recombinators.

### 9.2 Alternative in PoE1

For mod transfer:
- **Beastcrafting** — Bestiary recipes for specific mod transfers
- **Synthesizing** — Atlas passive for implicit mods
- **Eldritch altars** — Currency/divine mechanics

---

## 10. MOD SPAWNING RULES

### 10.1 Spawn Weight System

Each mod has **spawn weights** by tag:

```json
{
  "id": "local_physical_damage_+%",
  "spawn_weights": [
    {"tag": "sword", "weight": 1000},
    {"tag": "axe", "weight": 1000},
    {"tag": "body_armour", "weight": 0},
    {"tag": "default", "weight": 0}
  ]
}
```

**Algorithm — First Tag Wins:**
1. Get item's tags (e.g., `["body_armour", "evasion"]`)
2. For mod's spawn_weights: iterate in ORDER
3. First matching tag = weight used
4. If no tag matches → weight = 0 (mod cannot spawn)

### 10.2 Mod Groups (Mutual Exclusion)

**Mods in the same group CANNOT coexist on the same item.**

```sql
-- Example: "IncreasedLife" group
mod_groups:
  - "IncreasedLife1" (40-49 life)
  - "IncreasedLife2" (50-59 life)
  - "IncreasedLife3" (60-69 life)
```

**If you have IncreasedLife2 and try to add IncreasedLife3:**
- Only ONE can exist
- Game replaces the existing one

### 10.3 Item Level Requirements

```sql
-- Mod has required_level
SELECT id, name, required_level 
FROM mods 
WHERE id LIKE '%life%' 
ORDER BY required_level;
```

**Rule:** Mod only spawns if `item.required_level >= mod.required_level`

### 10.4 Influence Mods

| Influence  | Tag Suffix  | Example Tag    |
|------------|-------------|----------------|
| Shaper     | shaper      | body_armour_shaper |
| Elder      | elder       | body_armour_elder |
| Crusader   | crusader    | body_armour_crusader |
| Hunter     | basilisk    | body_armour_basilisk |
| Redeemer   | eyrie       | body_armour_eyrie |
| Warlord    | adjudicator | body_armour_adjudicator |

### 10.5 Database Weight Resolution

```python
# From weights.py
def resolve_spawn_weights(base_item_id, item_level, fossil_ids=None, influence=""):
    # 1. Get base_item_tags
    # 2. Query mods WHERE required_level <= item_level
    # 3. For each mod:
    #    - Iterate spawn_weights (ORDERED)
    #    - First matching tag = weight
    # 4. Apply fossil modifiers
    # 5. Filter weight == 0
```

---

## 11. CRITICAL INTERACTIONS SUMMARY

### 11.1 Metamod Interaction Matrix

```
+----------------------+--------+--------+--------+--------+--------+
| Action               | P-lock | S-lock | Attack | Caster | Both  |
+----------------------+--------+--------+--------+--------+--------+
| Chaos Orb            | S only | P only | ✓      | ✓      | NONE  |
| Exalted Orb          | No add | No add | ✓      | ✓      | NONE  |
| Annulment            | Skip   | Skip   | ✓      | ✓      | NONE  |
| Essence              | Skip   | Skip   | ✓      | ✓      | NONE  |
| Fossil               | Skip   | Skip   | ✓      | ✓      | NONE  |
| Scouring             | REMOVE | REMOVE | ✓      | ✓      | REMOVE|
| Bench Craft          | ✓      | ✓      | ✓      | ✓      | ✓     |
+----------------------+--------+--------+--------+--------+--------+

Legend:
- P-lock = Prefixes Cannot Be Changed
- S-lock = Suffixes Cannot Be Changed
- "Skip" = Cannot target locked slots
- "✓" = Respects lock (doesn't add to that type)
- "NONE" = No effect (nothing unlocked)
- "REMOVE" = Removes the metamod along with mods
```

### 11.2 Scouring + Metamod

**CRITICAL FINDING:** Scouring REMOVES metamods along with all mods.

```
Before Scour: [Mod1] [Mod2] [Prefixes Cannot Be Changed]
After Scour:  [nothing] — metamod is GONE
```

This is different from other currencies!

### 11.3 Chaos + Metamod

```
Both locked → Chaos does NOTHING
Prefixes locked → Only suffixes reroll
Suffixes locked → Only prefixes reroll
Neither locked → Both reroll
```

### 11.4 Annulment + Metamod

```
Annulment selects uniformly from UNLOCKED mods only.
If all mods are locked → Annul does NOTHING
```

### 11.5 Essence/Fossil + Metamod

```
Essence/Fossil ADD mods to unlocked slots.
Locked slots are SKIPPED.
If no unlocked slots → essence/fossil cannot be used
```

### 11.6 Exalted + Metamod

```
Exalted ADDS to an unlocked slot.
If prefixes locked and suffixes full → Exalt does NOTHING
If suffixes locked and prefixes full → Exalt does NOTHING
If both locked or both full → Exalt does NOTHING
```

---

## 12. PROBABILITY DISTRIBUTIONS

### 12.1 Rare Item Mod Count Distribution

```python
# From probability.py
MOD_COUNT_DISTRIBUTION = {
    3: 0.0,   # Impossible for rare
    4: 2/3,   # ~66.7%
    5: 1/4,   # ~25%
    6: 1/12,  # ~8.3%
}
```

**Distribution:** P(4 mods) = 66.7%, P(5 mods) = 25%, P(6 mods) = 8.3%

### 12.2 Prefix/Suffix Balance Rules

```
Maximum: 3 prefixes + 3 suffixes = 6 total

Rule: You CANNOT have more than 3 of each type.
But: You can have 4 prefixes + 2 suffixes, or 3 prefixes + 3 suffixes
```

### 12.3 Magic Item Mod Count

```python
# Magic item always has exactly 2 mods
MAGIC_ITEM_MOD_COUNT = 2  # 1 prefix + 1 suffix
```

### 12.4 Spawn Weight Calculation

```python
# Probability of hitting target mod
P_hit = target_mod_weight / total_weight_for_type
```

**Example:**
- Life mod weight: 500
- All prefix weight: 10000
- P(hit life) = 500 / 10000 = 5%

### 12.5 Chaos Roll Probability

For hitting K target mods:

```python
# Sequential slot selection
P = P(prefix slot 1) × P(prefix slot 2) × ... × P(suffix slot 1) × ...

# Each slot:
# - Remove mods from same group (mutual exclusion)
# - Calculate weight of remaining targets
# - P = target_weight / remaining_pool_weight
```

### 12.6 Essence Probability

```python
# Essence GUARANTEES one specific mod
# Probability = 1.0 for that mod
# Remaining slots: chaos-like roll
```

---

## APPENDIX A: Database Schema Reference

```sql
-- Core tables for crafting
mods (
    id, name, generation_type, domain,
    required_level, spawn_weights, stats, groups,
    is_essence_only, is_fossil_only
)

essences (
    id, name, tier, level
)

essence_mods (
    essence_id, item_class_id, mod_id, min_value, max_value
)

fossils (
    id, name
)

fossil_weight_modifiers (
    fossil_id, tag_id, multiplier, is_positive
)

fossil_blocked_tags (
    fossil_id, tag_id
)

metamod_rules (
    method_id, respects_prefixes_locked, respects_suffixes_locked,
    respects_cannot_roll_attack, ignores_all_metamods
)

crafting_methods (
    id, name, category, can_use_with_metamods
)

mod_groups (
    id, name, max_count
)
```

---

## APPENDIX B: Code References

| File | Purpose |
|------|---------|
| `craft/models.py` | Core data models (DesiredMod, TargetItem, ModCandidate) |
| `craft/probability.py` | Probability calculations (chaos, essence, fossil) |
| `craft/weights.py` | Spawn weight resolution (first-tag-wins) |
| `craft/mdp.py` | MDP solver for optimal crafting policy |
| `craft/policy_models.py` | MDP states, actions, transitions |
| `craft/cost.py` | Currency price lookups |
| `db/schema.sql` | Complete database schema |

---

## APPENDIX C: Key Formulas

### Expected Cost
```
E(cost) = (cost_per_attempt) × (1 / P(success))
```

### Spawn Weight Resolution
```
weight(mod, item) = spawn_weights[mod].find_first(tag ∈ item.tags)
```

### Chaos Roll Probability (simplified)
```
P(all targets) = Π P(target_i in slot_i)
P(target in slot) = weight(target) / sum(weights)
```

### Metamod Cost
```
metamod_cost = 2 × exalt_price
```

---

*Document Version: 1.0*  
*Last Updated: 2026-05-25*  
*Source: Path of Exile Wiki Project Craft Calculator*
