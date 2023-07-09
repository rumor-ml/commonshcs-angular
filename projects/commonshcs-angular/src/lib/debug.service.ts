import { Router } from '@angular/router';
import { CollectionPaths } from './indexedDb-docs';

export interface Fixture {
  id: string,
  path: string[],
  queryParams: { [key: string]: string },
  docs: CollectionPaths
}

export class DebugService {

  constructor(
    public fixtures: Fixture[],
    private router: Router
  ) {
    window.addEventListener("message", (event) => {
      if (event.source === window && event.data.fixture) {
        this.loadFixture(event.data.fixture as Fixture)
      }
    }, false);
    window.postMessage({chcsdebug: this.toMessage()}, "*")
  }

  loadFixture(f: Fixture) {
    // TODO: https://stackoverflow.com/questions/41280471/how-to-implement-routereusestrategy-shoulddetach-for-specific-routes-in-angular
    this.router.navigate(f.path, {
      queryParams: f.queryParams,
      onSameUrlNavigation: 'reload'
    })
    console.log(f)
  }

  toMessage() {
    return {
      fixtures: this.fixtures
    }
  }
}
