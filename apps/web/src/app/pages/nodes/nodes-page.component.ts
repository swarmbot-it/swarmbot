import { Component, inject } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { AsyncPipe } from '@angular/common';
import { TableModule } from 'primeng/table';
import { Card } from 'primeng/card';
import { map } from 'rxjs/operators';

const NODES = gql`
  query Nodes {
    nodes {
      id
      hostname
      role
      availability
    }
  }
`;

@Component({
  selector: 'app-nodes-page',
  standalone: true,
  imports: [AsyncPipe, TableModule, Card],
  template: `
    <p-card header="Nodes">
      <p-table [value]="(vm$ | async) ?? []" [paginator]="true" [rows]="20">
        <ng-template pTemplate="header">
          <tr>
            <th>Hostname</th>
            <th>Role</th>
            <th>Availability</th>
            <th>ID</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-n>
          <tr>
            <td>{{ n.hostname }}</td>
            <td>{{ n.role }}</td>
            <td>{{ n.availability ?? '-' }}</td>
            <td><code>{{ n.id }}</code></td>
          </tr>
        </ng-template>
      </p-table>
    </p-card>
  `
})
export class NodesPageComponent {
  private readonly apollo = inject(Apollo);

  readonly vm$ = this.apollo
    .watchQuery<{ nodes: Array<{ id: string; hostname: string; role: string; availability?: string }> }>({
      query: NODES,
      fetchPolicy: 'network-only'
    })
    .valueChanges.pipe(map((x) => x.data?.nodes ?? []));
}

