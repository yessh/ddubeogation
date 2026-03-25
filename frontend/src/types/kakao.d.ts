declare namespace kakao.maps {
  function load(callback: () => void): void;

  class Map {
    constructor(container: HTMLElement, options: MapOptions);
    setCenter(latlng: LatLng): void;
    getCenter(): LatLng;
    setLevel(level: number): void;
    setBounds(bounds: LatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number): void;
  }

  class LatLng {
    constructor(lat: number, lng: number);
    getLat(): number;
    getLng(): number;
  }

  class LatLngBounds {
    constructor();
    extend(latlng: LatLng): void;
    isEmpty(): boolean;
  }

  class Marker {
    constructor(options: MarkerOptions);
    setMap(map: Map | null): void;
    setPosition(latlng: LatLng): void;
    getPosition(): LatLng;
  }

  class MarkerImage {
    constructor(src: string, size: Size, options?: { offset?: Point });
  }

  class Size {
    constructor(width: number, height: number);
  }

  class Point {
    constructor(x: number, y: number);
  }

  class Polyline {
    constructor(options: PolylineOptions);
    setMap(map: Map | null): void;
    setPath(path: LatLng[]): void;
  }

  class CustomOverlay {
    constructor(options: CustomOverlayOptions);
    setMap(map: Map | null): void;
    setPosition(latlng: LatLng): void;
  }

  class Circle {
    constructor(options: CircleOptions);
    setMap(map: Map | null): void;
    setPosition(latlng: LatLng): void;
    setRadius(radius: number): void;
  }

  interface MapMouseEvent {
    latLng: LatLng;
  }

  namespace event {
    function addListener(
      target: Map | Marker,
      type: string,
      handler: (e: MapMouseEvent) => void
    ): void;
    function removeListener(
      target: Map | Marker,
      type: string,
      handler: (e: MapMouseEvent) => void
    ): void;
  }

  interface MapOptions {
    center: LatLng;
    level?: number;
  }

  interface MarkerOptions {
    position: LatLng;
    map?: Map;
    image?: MarkerImage;
    title?: string;
    zIndex?: number;
  }

  interface PolylineOptions {
    path?: LatLng[];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
    map?: Map;
  }

  interface CustomOverlayOptions {
    position: LatLng;
    content: string | HTMLElement;
    map?: Map;
    zIndex?: number;
    xAnchor?: number;
    yAnchor?: number;
  }

  interface CircleOptions {
    center: LatLng;
    radius: number;
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    fillColor?: string;
    fillOpacity?: number;
    map?: Map;
    zIndex?: number;
  }

  namespace services {
    class Geocoder {
      coord2Address(
        lng: number,
        lat: number,
        callback: (result: CoordResult[], status: Status) => void
      ): void;
    }
    class Places {
      keywordSearch(
        keyword: string,
        callback: (result: PlaceResult[], status: Status, pagination: Pagination) => void,
        options?: PlaceSearchOptions
      ): void;
    }
    type Status = 'OK' | 'ZERO_RESULT' | 'ERROR';
    interface CoordResult {
      address: { address_name: string };
      road_address: { address_name: string } | null;
    }
    interface PlaceResult {
      id: string;
      place_name: string;
      category_name: string;
      address_name: string;
      road_address_name: string;
      x: string; // longitude
      y: string; // latitude
      phone: string;
      place_url: string;
      distance: string;
    }
    interface Pagination {
      totalCount: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
      gotoPage(page: number): void;
      nextPage(): void;
      prevPage(): void;
    }
    interface PlaceSearchOptions {
      location?: LatLng;
      radius?: number;
      bounds?: LatLngBounds;
      category_group_code?: string;
      page?: number;
      size?: number;
      sort?: 'accuracy' | 'distance';
    }
  }
}
