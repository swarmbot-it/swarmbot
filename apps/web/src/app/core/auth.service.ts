import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

const TOKEN_KEY = 'swarmbot.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _authed = signal<boolean>(Boolean(localStorage.getItem(TOKEN_KEY)));

  constructor(private readonly router: Router) {}

  isAuthed(): boolean {
    return this._authed();
  }

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    this._authed.set(true);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this._authed.set(false);
    void this.router.navigateByUrl('/login');
  }
}

