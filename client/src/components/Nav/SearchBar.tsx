import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import debounce from 'lodash/debounce';
import { Search, X } from 'lucide-react';
import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRecoilState } from 'recoil';
import { useLocalize, useNewConvo } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';

type SearchBarProps = {
  isSmallScreen?: boolean;
};

const SearchBar = forwardRef((props: SearchBarProps, ref: React.Ref<HTMLDivElement>) => {
  const localize = useLocalize();
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isSmallScreen } = props;

  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [showClearIcon, setShowClearIcon] = useState(false);

  const { newConversation: newConvo } = useNewConvo();
  const [search, setSearchState] = useRecoilState(store.search);

  const clearSearch = useCallback(
    (pathname?: string) => {
      if (pathname?.includes('/search') || pathname === '/c/new') {
        queryClient.removeQueries([QueryKeys.messages]);
        newConvo({ disableFocus: true });
        navigate('/c/new');
      }
    },
    [newConvo, navigate, queryClient],
  );

  const clearText = useCallback(
    (pathname?: string) => {
      setShowClearIcon(false);
      setText('');
      setSearchState((prev) => ({
        ...prev,
        query: '',
        debouncedQuery: '',
        isTyping: false,
      }));
      clearSearch(pathname);
      inputRef.current?.focus();
    },
    [setSearchState, clearSearch],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const { value } = e.target as HTMLInputElement;
      if (e.key === 'Backspace' && value === '') {
        clearText(location.pathname);
      }
    },
    [clearText, location.pathname],
  );

  const sendRequest = useCallback(
    (value: string) => {
      if (!value) {
        return;
      }
      queryClient.invalidateQueries([QueryKeys.messages]);
    },
    [queryClient],
  );

  const debouncedSetDebouncedQuery = useMemo(
    () =>
      debounce((value: string) => {
        setSearchState((prev) => ({ ...prev, debouncedQuery: value, isTyping: false }));
        sendRequest(value);
      }, 500),
    [setSearchState, sendRequest],
  );

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setShowClearIcon(value.length > 0);
    setText(value);
    setSearchState((prev) => ({
      ...prev,
      query: value,
      isTyping: true,
    }));
    debouncedSetDebouncedQuery(value);
    if (value.length > 0 && location.pathname !== '/search') {
      navigate('/search', { replace: true });
    }
  };

  // Automatically set isTyping to false when loading is done and debouncedQuery matches query
  // (prevents stuck loading state if input is still focused)
  useEffect(() => {
    if (search.isTyping && !search.isSearching && search.debouncedQuery === search.query) {
      setSearchState((prev) => ({ ...prev, isTyping: false }));
    }
  }, [search.isTyping, search.isSearching, search.debouncedQuery, search.query, setSearchState]);

  return (
    <div
      ref={ref}
      className={cn(
        'border-fig-Stroke-soft bg-fig-Surface-standard text-fig-Text-body group relative mt-1 flex h-8 cursor-text items-stretch overflow-hidden rounded-[2px] border transition-[border-color,box-shadow] duration-200',
        isSmallScreen === true ? 'mb-2 h-14' : '',
      )}
    >
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 items-center gap-1 pl-1.5 pr-8',
          isSmallScreen === true && 'gap-1.5 px-2 pr-10',
        )}
      >
        <Search
          className="text-fig-Subject-standard pointer-events-none h-4 w-4 shrink-0"
          aria-hidden
        />
        <input
          type="text"
          ref={inputRef}
          className={cn(
            'text-fig-Text-body caret-fig-Text-body placeholder:text-fig-Subject-soft m-0 min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-normal leading-4 placeholder:font-normal focus-visible:outline-none',
            isSmallScreen === true && 'text-sm leading-5',
          )}
          value={text}
          onChange={onChange}
          onKeyDown={(e) => {
            e.code === 'Space' ? e.stopPropagation() : null;
          }}
          aria-label={localize('com_nav_search_placeholder')}
          placeholder={localize('com_nav_search_placeholder')}
          onKeyUp={handleKeyUp}
          onFocus={() => setSearchState((prev) => ({ ...prev, isSearching: true }))}
          onBlur={() => setSearchState((prev) => ({ ...prev, isSearching: false }))}
          autoComplete="off"
          dir="auto"
        />
      </div>
      <button
        type="button"
        aria-label={`${localize('com_ui_clear')} ${localize('com_ui_search')}`}
        className={cn(
          'text-fig-Subject-standard hover:text-fig-Text-body focus-visible:ring-fig-Stroke-soft absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm border-0 bg-transparent p-0 transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2',
          showClearIcon ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
          isSmallScreen === true ? 'right-2' : '',
        )}
        onClick={() => clearText(location.pathname)}
        tabIndex={showClearIcon ? 0 : -1}
        disabled={!showClearIcon}
      >
        <X className="h-4 w-4 shrink-0 cursor-pointer" />
      </button>
    </div>
  );
});

export default SearchBar;
