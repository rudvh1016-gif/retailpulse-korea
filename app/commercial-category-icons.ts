export interface CommercialCategoryIcon {src:string; width:number; height:number}
export function commercialIconSrcSet(icon:CommercialCategoryIcon){
 const key=icon.src.split('/').at(-1)!.replace('-64.webp','');
 return `${icon.src} 64w, /commercial-icons/miniatures/${key}-128.webp 128w, /commercial-icons/sharp-v1/${key}-256.webp 256w`;
}
/** Exact provider business-category labels. Illustrations never determine chart values. */
export const commercialCategoryIcons:Readonly<Record<string,CommercialCategoryIcon>>={
  "한식": {
    "src": "/commercial-icons/korean_food-64.webp",
    "width": 64,
    "height": 64
  },
  "일식/중식/양식": {
    "src": "/commercial-icons/world_food-64.webp",
    "width": 64,
    "height": 64
  },
  "제과/커피/패스트푸드": {
    "src": "/commercial-icons/cafe_bakery-64.webp",
    "width": 64,
    "height": 64
  },
  "기타요식": {
    "src": "/commercial-icons/other_dining-64.webp",
    "width": 64,
    "height": 64
  },
  "할인점/슈퍼마켓": {
    "src": "/commercial-icons/grocery-64.webp",
    "width": 64,
    "height": 64
  },
  "편의점": {
    "src": "/commercial-icons/convenience-64.webp",
    "width": 64,
    "height": 64
  },
  "의복/의류": {
    "src": "/commercial-icons/clothing-64.webp",
    "width": 64,
    "height": 64
  },
  "패션/잡화": {
    "src": "/commercial-icons/accessories-64.webp",
    "width": 64,
    "height": 64
  },
  "스포츠/문화/레저": {
    "src": "/commercial-icons/recreation-64.webp",
    "width": 64,
    "height": 64
  },
  "화장품": {
    "src": "/commercial-icons/cosmetics-64.webp",
    "width": 64,
    "height": 64
  },
  "약국": {
    "src": "/commercial-icons/pharmacy-64.webp",
    "width": 64,
    "height": 64
  },
  "유흥": {
    "src": "/commercial-icons/nightlife-64.webp",
    "width": 64,
    "height": 64
  },
  "미용서비스": {
    "src": "/commercial-icons/beauty_service-64.webp",
    "width": 64,
    "height": 64
  }
};
export const commercialCategoryFallback:CommercialCategoryIcon={"src":"/commercial-icons/fallback-64.webp","width":64,"height":64};
