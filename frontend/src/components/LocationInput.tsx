import { useState, useRef, useCallback, useEffect } from 'react';

interface PlaceResult {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  x: string; // longitude
  y: string; // latitude
}

interface LocationInputProps {
  label: string;
  color: 'green' | 'red';
  value: string;            // confirmed address to display
  isPickMode: boolean;      // currently in map-pick mode
  onActivatePickMode: () => void;
  onSelect: (lat: number, lon: number, address: string) => void;
  onGetGPS?: () => void;
  gpsLoading?: boolean;
  disabled?: boolean;
}

export function LocationInput({
  label,
  color,
  value,
  isPickMode,
  onActivatePickMode,
  onSelect,
  onGetGPS,
  gpsLoading,
  disabled,
}: LocationInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When value is confirmed externally (map click or GPS), reset search state
  useEffect(() => {
    if (value) {
      setQuery('');
      setResults([]);
      setIsFocused(false);
    }
  }, [value]);

  const doSearch = useCallback((kw: string) => {
    if (!kw.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const ps = new kakao.maps.services.Places();
      ps.keywordSearch(kw, (data, status) => {
        setSearching(false);
        if (status === 'OK') {
          setResults((data as PlaceResult[]).slice(0, 5));
        } else {
          setResults([]);
        }
      });
    } catch {
      setSearching(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleSelectResult = (place: PlaceResult) => {
    onSelect(parseFloat(place.y), parseFloat(place.x), place.place_name);
    setQuery('');
    setResults([]);
    setIsFocused(false);
  };

  const handleClickDisplay = () => {
    if (disabled) return;
    setIsFocused(true);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const dotColor = color === 'green' ? 'bg-green-500' : 'bg-red-500';
  const activeRing =
    color === 'green'
      ? 'ring-2 ring-green-500 bg-green-50'
      : 'ring-2 ring-red-500 bg-red-50';

  const showSearchInput = (isFocused || !value) && !isPickMode;

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 w-full rounded-xl px-3 py-2.5 transition-all ${
          isPickMode
            ? activeRing
            : isFocused
            ? 'bg-white ring-1 ring-gray-300'
            : 'bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <span className={`w-3 h-3 rounded-full ${dotColor} shrink-0`} />

        {/* Input or display text */}
        {showSearchInput ? (
          <input
            ref={inputRef}
            type="text"
            className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400 min-w-0"
            placeholder={`${label} 검색`}
            value={query}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 150)}
            autoFocus={isFocused && !value}
          />
        ) : isPickMode ? (
          <span className="flex-1 text-sm text-gray-500 select-none">
            지도에서 위치를 클릭하세요
          </span>
        ) : (
          <button
            className="flex-1 text-left min-w-0"
            onClick={handleClickDisplay}
            disabled={disabled}
          >
            <span
              className={`text-sm truncate block ${
                value ? 'text-gray-800' : 'text-gray-400'
              }`}
            >
              {value || `${label} 검색 또는 지도 클릭`}
            </span>
          </button>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* GPS button (origin only) */}
          {onGetGPS && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={onGetGPS}
              disabled={!!gpsLoading || disabled}
              title="현재 GPS 위치 사용"
              className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 disabled:opacity-40 transition-colors"
            >
              {gpsLoading ? (
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <circle cx="12" cy="12" r="3" fill="currentColor" strokeWidth={0} />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  <circle cx="12" cy="12" r="7" strokeOpacity={0.3} />
                </svg>
              )}
            </button>
          )}
          {/* Map-pick button */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!disabled) onActivatePickMode();
            }}
            disabled={disabled}
            title="지도에서 선택"
            className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
              isPickMode
                ? 'text-orange-500 bg-orange-50'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search results dropdown */}
      {isFocused && (results.length > 0 || searching) && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
          {searching && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-400 text-center">
              검색 중...
            </div>
          )}
          {results.map((place) => (
            <button
              key={place.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelectResult(place)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
            >
              <div className="text-sm font-medium text-gray-800 truncate">
                {place.place_name}
              </div>
              <div className="text-xs text-gray-400 truncate mt-0.5">
                {place.road_address_name || place.address_name}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
