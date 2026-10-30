// Colours use descriptive names from the supplied screenshots, not official paint codes.
export type ProductConfiguration = {
  id: string; name: string; colours: readonly { name: string; hex: string }[];
  connectivity: boolean; range: boolean; longRangeCharger: boolean;
};
export const PRODUCT_IDS = ["urbn", "hum", "kivo", "m7", "m7l", "mvs7", "kivo24", "kivo_easy"] as const;
export const PRODUCT_CATALOG: readonly ProductConfiguration[] = [
  {
    "id": "m7",
    "name": "M7",
    "colours": [
      {
        "name": "Yellow",
        "hex": "#ffef00"
      },
      {
        "name": "Black",
        "hex": "#000000"
      },
      {
        "name": "White",
        "hex": "#ffffff"
      },
      {
        "name": "Grey",
        "hex": "#696969"
      },
      {
        "name": "Blue",
        "hex": "#43c7e7"
      },
      {
        "name": "Red",
        "hex": "#db5a5a"
      }
    ],
    "connectivity": false,
    "range": false,
    "longRangeCharger": false
  },
  {
    "id": "m7l",
    "name": "M7L",
    "colours": [
      {
        "name": "Yellow",
        "hex": "#ffef00"
      },
      {
        "name": "Black",
        "hex": "#000000"
      },
      {
        "name": "White",
        "hex": "#ffffff"
      },
      {
        "name": "Grey",
        "hex": "#696969"
      },
      {
        "name": "Blue",
        "hex": "#43c7e7"
      },
      {
        "name": "Red",
        "hex": "#db5a5a"
      }
    ],
    "connectivity": false,
    "range": false,
    "longRangeCharger": false
  },
  {
    "id": "mvs7",
    "name": "MVS7",
    "colours": [
      {
        "name": "Yellow",
        "hex": "#ffef00"
      },
      {
        "name": "Black",
        "hex": "#000000"
      },
      {
        "name": "White",
        "hex": "#ffffff"
      },
      {
        "name": "Grey",
        "hex": "#696969"
      },
      {
        "name": "Blue",
        "hex": "#43c7e7"
      },
      {
        "name": "Red",
        "hex": "#db5a5a"
      }
    ],
    "connectivity": false,
    "range": false,
    "longRangeCharger": false
  },
  {
    "id": "urbn",
    "name": "URBN",
    "colours": [
      {
        "name": "Yellow",
        "hex": "#fbba10"
      },
      {
        "name": "White",
        "hex": "#ffffff"
      },
      {
        "name": "Blue",
        "hex": "#64b6d3"
      },
      {
        "name": "Orange",
        "hex": "#e86b30"
      }
    ],
    "connectivity": true,
    "range": false,
    "longRangeCharger": false
  },
  {
    "id": "hum",
    "name": "HUM",
    "colours": [
      {
        "name": "Black",
        "hex": "#000000"
      },
      {
        "name": "Grey",
        "hex": "#a9a9a9"
      },
      {
        "name": "Blue",
        "hex": "#42aff9"
      }
    ],
    "connectivity": true,
    "range": true,
    "longRangeCharger": true
  },
  {
    "id": "kivo24",
    "name": "KIVO 24",
    "colours": [
      {
        "name": "Cyan",
        "hex": "#4bfcfc"
      },
      {
        "name": "Grey",
        "hex": "#a9a9a9"
      },
      {
        "name": "Purple",
        "hex": "#c298c0"
      },
      {
        "name": "Pink",
        "hex": "#e07598"
      }
    ],
    "connectivity": true,
    "range": true,
    "longRangeCharger": false
  },
  {
    "id": "kivo",
    "name": "KIVO",
    "colours": [
      {
        "name": "Dark grey",
        "hex": "#4b4949"
      },
      {
        "name": "Lime",
        "hex": "#c1d655"
      },
      {
        "name": "Red",
        "hex": "#ea3324"
      },
      {
        "name": "Light grey",
        "hex": "#c2c0c0"
      }
    ],
    "connectivity": true,
    "range": true,
    "longRangeCharger": false
  },
  {
    "id": "kivo_easy",
    "name": "KIVO Easy",
    "colours": [
      {
        "name": "Pink",
        "hex": "#d43e71"
      },
      {
        "name": "Cyan",
        "hex": "#00ffff"
      },
      {
        "name": "Lime",
        "hex": "#c1d655"
      }
    ],
    "connectivity": true,
    "range": true,
    "longRangeCharger": false
  }
];
export const CONNECTIVITY_LABELS = { standard: "Standard", smart_plus: "Smart Plus" } as const;
export const RANGE_LABELS = { normal: "Normal Range", long: "Long Range" } as const;
export const CHARGER_LABELS = { normal: "Normal Charger", fast: "Fast Charger" } as const;
export function getProduct(id: string) { return PRODUCT_CATALOG.find(p => p.id === id); }
export function validProductChoices(value: {productId: string; colour: string; connectivity: string; rangeVariant: string; chargerType: string}): boolean {
 const p = getProduct(value.productId);
 if (!p || !p.colours.some(c => c.name === value.colour)) return false;
 if (p.connectivity ? !Object.hasOwn(CONNECTIVITY_LABELS, value.connectivity) : value.connectivity !== "") return false;
 if (p.range ? !Object.hasOwn(RANGE_LABELS, value.rangeVariant) : value.rangeVariant !== "") return false;
 const needsCharger = p.longRangeCharger && value.rangeVariant === "long";
 return needsCharger ? Object.hasOwn(CHARGER_LABELS, value.chargerType) : value.chargerType === "";
}
