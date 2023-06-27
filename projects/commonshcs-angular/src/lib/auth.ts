import { BehaviorSubject } from "rxjs"

export interface User {
  uid: string,
  displayName: string | null,
  email: string | null,
  photoURL: string | null,
}

export interface AuthService {

  user: BehaviorSubject<User | null>

}