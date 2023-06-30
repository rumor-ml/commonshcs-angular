import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MediaDebuggerComponent } from './media-debugger.component';

describe('MediaDebuggerComponent', () => {
  let component: MediaDebuggerComponent;
  let fixture: ComponentFixture<MediaDebuggerComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MediaDebuggerComponent]
    });
    fixture = TestBed.createComponent(MediaDebuggerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
