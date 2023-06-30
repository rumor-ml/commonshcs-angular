import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { map } from 'rxjs';


@Component({
  selector: 'lib-media-debugger',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './media-debugger.component.html',
  styleUrls: ['./media-debugger.component.css']
})
export class MediaDebuggerComponent {

  SIZES = [
    'XSmall',
    'Small',
    'Medium',
    'Large',
    'XLarge'
  ]

  size = this.breakpointObserver.observe(
    this.SIZES.map(s => (Breakpoints as any)[s])
  ).pipe(
    map(({breakpoints}) => this.SIZES[
      Object.entries(breakpoints).findIndex(([k, v]) => v)
    ])
  )

  constructor(
    private breakpointObserver: BreakpointObserver
  ){}
}
