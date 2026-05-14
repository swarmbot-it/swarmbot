import { Component, inject } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { AsyncPipe } from '@angular/common';
import { TableModule } from 'primeng/table';
import { Card } from 'primeng/card';
import { map } from 'rxjs/operators';

const SERVICES = gql`
  query Services {
    services {
      id
      name
      image
      replicas
    }
  }
`;

@Component({
  selector: 'app-services-page',
  standalone: true,
  imports: [AsyncPipe, TableModule, Card],
  template: `
    <p-card header="Services">
      <p-table [value]="(vm$ | async) ?? []" [paginator]="true" [rows]="20">
        <ng-template pTemplate="header">
          <tr>
            <th>Name</th>
            <th>Image</th>
            <th>Replicas</th>
            <th>ID</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-svc>
          <tr>
            <td>{{ svc.name }}</td>
            <td>{{ svc.image }}</td>
            <td>{{ svc.replicas ?? '-' }}</td>
            <td><code>{{ svc.id }}</code></td>
          </tr>
        </ng-template>
      </p-table>
    </p-card>
  `
})
export class ServicesPageComponent {
  private readonly apollo = inject(Apollo);

  readonly vm$ = this.apollo
    .watchQuery<{ services: Array<{ id: string; name: string; image?: string; replicas?: number }> }>({
      query: SERVICES,
      fetchPolicy: 'network-only'
    })
    .valueChanges.pipe(map((x) => x.data?.services ?? []));
}

