import { TestBed } from '@angular/core/testing';

import { SearchDocsService } from './search-docs.service';

describe('SearchService', () => {
  let service: SearchDocsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SearchDocsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
