import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Apollo, gql } from 'apollo-angular';
import { NgIf } from '@angular/common';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonDirective } from 'primeng/button';
import { Card } from 'primeng/card';
import { AuthService } from '../../core/auth.service';

const LOGIN = gql`
  mutation Login($username: String!, $password: String!) {
    login(username: $username, password: $password) {
      token
    }
  }
`;

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, InputTextModule, ButtonDirective, Card, NgIf],
  template: `
    <p-card header="Login" styleClass="login-card">
      <form [formGroup]="form" (ngSubmit)="submit()">
        <div class="field">
          <label>Username</label>
          <input pInputText formControlName="username" />
        </div>
        <div class="field">
          <label>Password</label>
          <input pInputText type="password" formControlName="password" />
        </div>
        <button pButton type="submit" [disabled]="form.invalid || loading">
          <span pButtonLabel>Sign in</span>
        </button>
        <div class="error" *ngIf="error">{{ error }}</div>
      </form>
    </p-card>
  `,
  styles: [
    `
      :host {
        display: flex;
        justify-content: center;
      }
      .login-card {
        width: 420px;
        margin-top: 2rem;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin-bottom: 1rem;
      }
      .error {
        margin-top: 1rem;
        color: var(--p-red-600, #dc2626);
      }
    `
  ]
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly apollo = inject(Apollo);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  loading = false;
  error: string | null = null;

  readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(4)]]
  });

  submit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = null;

    const { username, password } = this.form.getRawValue();
    this.apollo
      .mutate<{ login: { token: string } }>({
        mutation: LOGIN,
        variables: { username, password }
      })
      .subscribe({
        next: (res) => {
          const token = res.data?.login.token;
          if (!token) {
            this.error = 'Login failed.';
            this.loading = false;
            return;
          }
          this.auth.setToken(token);
          void this.router.navigateByUrl('/services');
        },
        error: () => {
          this.error = 'Invalid credentials.';
          this.loading = false;
        }
      });
  }
}

