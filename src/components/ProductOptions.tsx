"use client";
import type { RegistrationFields } from '@/lib/types';
import { CHARGER_LABELS, CONNECTIVITY_LABELS, getProduct, RANGE_LABELS } from '@/lib/product-catalog';
import styles from './ProductOptions.module.scss';

type Choices = Pick<RegistrationFields,'colour'|'connectivity'|'rangeVariant'|'chargerType'>;
export function ProductOptions({fields,disabled,onChange}:{fields:RegistrationFields;disabled:boolean;onChange:(choices:Choices)=>void}) {
 const product=getProduct(fields.productId);
 if(!product)return null;
 const update=(next:Partial<Choices>)=>onChange({colour:fields.colour,connectivity:fields.connectivity,rangeVariant:fields.rangeVariant,chargerType:fields.chargerType,...next});
 return <div className={styles.options}>
  <fieldset disabled={disabled} className={styles.colours}>
   <legend>Colour</legend>
   <div className={styles.swatches}>
    {product.colours.map(c=><label key={c.name} className={styles.colour}>
     <input type="radio" name="product-colour" value={c.name} checked={fields.colour===c.name} onChange={()=>update({colour:c.name})} required />
     <span className={styles.swatch} style={{backgroundColor:c.hex}} aria-hidden="true" />
     <span>{c.name}</span>
    </label>)}
   </div>
  </fieldset>
  <div className={styles.selects}>
   {product.connectivity && <label>Connectivity
    <select value={fields.connectivity} onChange={e=>update({connectivity:e.target.value as Choices['connectivity']})} required disabled={disabled}>
     <option value="" disabled>Select connectivity</option>
     {Object.entries(CONNECTIVITY_LABELS).map(([v,label])=><option key={v} value={v}>{label}</option>)}
    </select>
   </label>}
   {product.range && fields.connectivity && <label>Range
    <select value={fields.rangeVariant} onChange={e=>update({rangeVariant:e.target.value as Choices['rangeVariant'],chargerType:''})} required disabled={disabled}>
     <option value="" disabled>Select range</option>
     {Object.entries(RANGE_LABELS).map(([v,label])=><option key={v} value={v}>{label}</option>)}
    </select>
   </label>}
   {product.longRangeCharger && fields.rangeVariant==='long' && <label>Charger
    <select value={fields.chargerType} onChange={e=>update({chargerType:e.target.value as Choices['chargerType']})} required disabled={disabled}>
     <option value="" disabled>Select charger</option>
     {Object.entries(CHARGER_LABELS).map(([v,label])=><option key={v} value={v}>{label}</option>)}
    </select>
   </label>}
  </div>
 </div>;
}
