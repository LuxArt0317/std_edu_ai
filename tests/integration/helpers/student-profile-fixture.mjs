import {profileFieldLabels} from '../../../server/studentProfileContract.js';

export const studentProfileDetails={
  ...Object.fromEntries(Object.keys(profileFieldLabels).map(key=>[key,null])),
  student_number:'QA-PROFILE',name_zh:'測試學生',name_en:'QA Student',
  identity_last_four:'6789',gender:'female',overseas:false,indigenous:true,
  registered_address:'Private QA address',original_mobile:'0900000000',
};
